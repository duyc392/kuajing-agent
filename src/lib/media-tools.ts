// 用途：外部媒体二进制封装（yt-dlp / ffmpeg / whisper）：统一 spawn 参数数组（不拼 shell 字符串，避免注入），
// 缺失时给出可执行的中文安装指引。只负责「跑命令、拿输出」，不解析业务语义。
import { spawn } from "node:child_process";
import { AppError } from "@/lib/errors";

export type MediaBinary = "yt-dlp" | "ffmpeg" | "whisper";

const INSTALL_HINT: Record<MediaBinary, string> = {
  "yt-dlp": "请先安装 yt-dlp（pip install -U yt-dlp）并确保它在 PATH 中",
  ffmpeg: "请先安装 ffmpeg 并确保它在 PATH 中（Windows 可 winget install Gyan.FFmpeg）",
  whisper: "请先安装 openai-whisper（pip install -U openai-whisper）并确保 whisper 命令在 PATH 中",
};

const ENV_OVERRIDE: Record<MediaBinary, string> = {
  "yt-dlp": "YTDLP_BIN",
  ffmpeg: "FFMPEG_BIN",
  whisper: "WHISPER_BIN",
};

export function binaryPathOf(binary: MediaBinary): string {
  return process.env[ENV_OVERRIDE[binary]] || binary;
}

export interface RunBinaryOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface BinaryOutput {
  code: number | null;
  stdout: string;
  stderr: string;
}

// 执行命令并收集输出：超时与外部取消都会杀掉子进程；二进制缺失时给出安装指引。
function spawnCollect(binary: MediaBinary, args: string[], options: RunBinaryOptions): Promise<BinaryOutput> {
  return new Promise<BinaryOutput>((resolve, reject) => {
    const child = spawn(binaryPathOf(binary), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: AppError | null, value: BinaryOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new AppError(`${binary} 执行超时（${Math.round(options.timeoutMs / 1000)} 秒），请缩短素材或稍后重试`, "MEDIA_TIMEOUT", 502), { code: null, stdout: "", stderr: "" });
    }, options.timeoutMs);
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(new AppError("请求已取消", "REQUEST_ABORTED", 499), { code: null, stdout: "", stderr: "" });
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      const message = error.code === "ENOENT"
        ? `${binary} 未安装：${INSTALL_HINT[binary]}`
        : `${binary} 启动失败，请检查安装与权限`;
      finish(new AppError(message, "MEDIA_BINARY_MISSING", 501), { code: null, stdout: "", stderr: "" });
    });
    child.on("close", (code) => finish(null, { code, stdout, stderr }));
  });
}

// 需要判定退出码的场景（如 ffmpeg 读元信息会以 1 退出但输出了 Duration）：不抛错，返回原始输出。
export function runBinaryRaw(binary: MediaBinary, args: string[], options: RunBinaryOptions): Promise<BinaryOutput> {
  return spawnCollect(binary, args, options);
}

// 必须成功的场景：非 0 退出码统一翻译成中文错误，原始 stderr 只进服务端日志。
export async function runBinary(binary: MediaBinary, args: string[], options: RunBinaryOptions): Promise<string> {
  const result = await spawnCollect(binary, args, options);
  if (result.code === 0) return result.stdout;
  console.error(`[media] ${binary} 退出码 ${result.code}:`, result.stderr.slice(-2000));
  throw new AppError(`${binary} 执行失败，请检查输入素材是否有效`, "MEDIA_FAILED", 502);
}

// 视频来源白名单：只允许解析 TikTok 系域名，避免把任意 URL 交给下载器（SSRF/盗链风险）。
export function assertAllowedVideoUrl(url: string, allowedHosts: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("视频链接格式不正确，请提供完整的 http(s) 链接", "INVALID_URL", 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError("只支持 http/https 视频链接", "INVALID_URL", 400);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedHosts.some((item) => host === item || host.endsWith(`.${item}`));
  if (!allowed) {
    throw new AppError(`暂不支持解析该域名（${host}），目前仅支持 TikTok 视频链接`, "UNSUPPORTED_HOST", 400);
  }
  return parsed;
}
