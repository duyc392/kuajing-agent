// 用途：图片生成 API 客户端（PRD 5.2：图片生成用 gpt-image-2，作为独立工具调用）：
// 调 OpenAI 兼容的 /images/generations 与 /images/edits，兼容 url（需下载）/b64_json 两种返回形态，统一返回已校验的图片字节。
// 下载地址做 SSRF 防护（仅 https、拒绝回环/私网/链路本地、重定向后复查）、大小与魔数校验；底层错误翻译成中文业务错误，原始错误只进服务端日志。
import { lookup } from "dns/promises";
import { AppError } from "@/lib/errors";
import { detectImageMime, IMAGE_MAX_BYTES } from "@/lib/image-bytes";

export interface ImageApiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface GeneratedImageBytes {
  bytes: Buffer;
  mimeType: string;
}

const IMAGE_TIMEOUT_MS = 90_000;
const DOWNLOAD_ATTEMPTS = 3;
export const IMAGE_SIZE = "1024x1024";

function statusError(status: number): AppError {
  if (status === 401) return new AppError("图片生成 API Key 无效或已过期，请到设置页检查", "IMAGE_AUTH", 502);
  if (status === 429) return new AppError("图片生成请求过于频繁或额度不足，请稍后重试", "IMAGE_QUOTA", 429);
  return new AppError(`图片生成服务返回错误（HTTP ${status}），请稍后重试`, "IMAGE_ERROR", 502);
}

// 组合信号：90 秒超时 + 外部取消；返回清理函数，请求正常结束也要释放定时器与监听器。
function combinedSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  };
  return { signal: controller.signal, cleanup };
}

// SSRF 防护：目标地址必须是 https，且解析出的所有 IP 都不落在回环/私网/链路本地/保留段。
async function isUnsafeImageUrl(url: URL): Promise<boolean> {
  if (url.protocol !== "https:") return true;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    return true;
  }
  for (const entry of addresses) {
    const ip = entry.address;
    if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.") || ip.startsWith("0.") || ip === "::1" || ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd")) {
      return true;
    }
    if (ip.startsWith("172.")) {
      const second = Number(ip.split(".")[1]);
      if (second >= 16 && second <= 31) return true;
    }
  }
  return false;
}

// 校验下载到的字节：大小上限 + 魔数识别，返回真实 MIME；不合格抛 IMAGE_FORMAT。
function validateImageBytes(bytes: Buffer): { bytes: Buffer; mimeType: string } {
  if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) {
    throw new AppError("图片文件为空或超过 10MB 上限", "IMAGE_FORMAT", 502);
  }
  const mimeType = detectImageMime(bytes);
  if (!mimeType) throw new AppError("图片服务返回的内容不是有效图片（PNG/JPEG/WebP）", "IMAGE_FORMAT", 502);
  return { bytes, mimeType };
}

// 下载 url 形态的图片：手动跟随重定向（每跳先解析并校验 Location 再发下一次请求，杜绝自动重定向把请求带进内网，形成盲 SSRF）；
// 读取前先看 Content-Length，超过上限直接拒绝，避免超大响应完整读进内存；外部取消信号贯通每次尝试。
const MAX_REDIRECTS = 3;

async function fetchWithManualRedirects(url: string, signal?: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (await isUnsafeImageUrl(parsed)) {
      throw new AppError("图片下载地址不安全，已拒绝下载", "IMAGE_UNSAFE_URL", 502);
    }
    const { signal: requestSignal, cleanup } = combinedSignal(signal);
    try {
      const response = await fetch(parsed, { signal: requestSignal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new AppError("图片下载重定向异常，请重试", "IMAGE_DOWNLOAD", 502);
        current = new URL(location, parsed).toString();
        continue;
      }
      return response;
    } finally {
      cleanup();
    }
  }
  throw new AppError("图片下载重定向次数过多，已拒绝", "IMAGE_UNSAFE_URL", 502);
}

async function downloadImageBytes(url: string, signal?: AbortSignal): Promise<GeneratedImageBytes> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithManualRedirects(url, signal);
      if (!response.ok) throw statusError(response.status);
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > IMAGE_MAX_BYTES) {
        throw new AppError("图片文件超过 10MB 上限", "IMAGE_FORMAT", 502);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const validated = validateImageBytes(bytes);
      return { bytes: validated.bytes, mimeType: validated.mimeType };
    } catch (error) {
      lastError = error;
      if (error instanceof AppError && (error.code === "IMAGE_UNSAFE_URL" || error.code === "IMAGE_FORMAT")) throw error;
      if (attempt < DOWNLOAD_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (lastError instanceof AppError) throw lastError;
  throw new AppError("图片文件下载失败，请重试", "IMAGE_DOWNLOAD", 502);
}

// 响应 data 项 → 图片字节：url 形态下载、b64_json 形态解码（同样过大小与魔数校验）。
async function resolveImageBytes(item: Record<string, unknown>, signal?: AbortSignal): Promise<GeneratedImageBytes> {
  const url = typeof item.url === "string" ? item.url : "";
  const b64 = typeof item.b64_json === "string" ? item.b64_json : "";
  if (url !== "") return downloadImageBytes(url, signal);
  if (b64 !== "") {
    const bytes = Buffer.from(b64, "base64");
    const validated = validateImageBytes(bytes);
    return { bytes: validated.bytes, mimeType: validated.mimeType };
  }
  throw new AppError("图片生成服务返回格式异常，请重试", "IMAGE_FORMAT", 502);
}

// 统一请求 + 错误翻译：原始错误正文只进服务端日志，前端收中文话术。
async function requestImageApi(endpoint: string, apiKey: string, init: RequestInit, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const { signal: requestSignal, cleanup } = combinedSignal(signal);
  let response: Response;
  try {
    try {
      response = await fetch(endpoint, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
        signal: requestSignal,
      });
    } catch {
      if (signal?.aborted) throw new AppError("请求已取消", "REQUEST_ABORTED", 499);
      throw new AppError("无法连接图片生成服务，请检查网络或代理后重试", "IMAGE_NETWORK", 502);
    }
    const text = await response.text();
    if (!response.ok) {
      console.error("[image] 图片服务原始错误:", text);
      throw statusError(response.status);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AppError("图片生成服务返回格式异常，请重试", "IMAGE_FORMAT", 502);
    }
    const data = (parsed as { data?: unknown }).data;
    if (!Array.isArray(data)) {
      throw new AppError("图片生成服务未返回图片，请重试", "IMAGE_EMPTY", 502);
    }
    const items = data.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    if (items.length === 0) {
      throw new AppError("图片生成服务未返回有效图片，请重试", "IMAGE_FORMAT", 502);
    }
    return items;
  } finally {
    cleanup();
  }
}

// 文生图：prompt → 已校验图片字节。
export async function generateImageBytes(settings: ImageApiSettings, prompt: string, signal?: AbortSignal): Promise<GeneratedImageBytes> {
  const endpoint = settings.baseUrl.replace(/\/+$/, "") + "/images/generations";
  const items = await requestImageApi(endpoint, settings.apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: settings.model, prompt, size: IMAGE_SIZE, n: 1 }),
  }, signal);
  return resolveImageBytes(items[0], signal);
}

// 图生图（变体/详情图）：参考图 + 修改指令 → 已校验图片字节。
export async function editImageBytes(settings: ImageApiSettings, reference: { bytes: Buffer; mimeType: string }, prompt: string, signal?: AbortSignal): Promise<GeneratedImageBytes> {
  const endpoint = settings.baseUrl.replace(/\/+$/, "") + "/images/edits";
  const form = new FormData();
  form.append("model", settings.model);
  form.append("prompt", prompt);
  form.append("size", IMAGE_SIZE);
  form.append("image", new Blob([new Uint8Array(reference.bytes)], { type: reference.mimeType }), "reference.png");
  const items = await requestImageApi(endpoint, settings.apiKey, { method: "POST", body: form }, signal);
  return resolveImageBytes(items[0], signal);
}
