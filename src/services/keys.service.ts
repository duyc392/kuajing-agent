// 用途：密钥业务逻辑：读取三项密钥的脱敏状态、合并保存用户提交的密钥到本地配置文件（全文只存在服务端）。
import { readKeysConfig, writeKeysConfig } from "@/lib/config";
import { originOf } from "@/lib/urls";
import type { KeyGroupStatus, KeysConfig, KeysStatus, SaveKeysInput } from "@/types";

// 配置更新互斥锁：同一时刻只允许一次"读-合并-写"，防止并发部分更新互相覆盖。
let saveQueue: Promise<unknown> = Promise.resolve();

const KEY_GROUPS = ["llm", "image", "fastmoss"] as const;

function maskKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

function toGroupStatus(config: KeysConfig, group: "llm" | "image" | "fastmoss"): KeyGroupStatus {
  const item = config[group];
  const configured = item.apiKey.trim().length > 0;
  const base: KeyGroupStatus = {
    configured,
    maskedKey: configured ? maskKey(item.apiKey) : "",
    baseUrl: item.baseUrl,
    model: "model" in item ? item.model : "",
  };
  if (group === "llm") base.memoryModel = config.llm.memoryModel;
  return base;
}

function toStatus(config: KeysConfig): KeysStatus {
  return {
    llm: toGroupStatus(config, "llm"),
    image: toGroupStatus(config, "image"),
    fastmoss: toGroupStatus(config, "fastmoss"),
    allConfigured: config.llm.apiKey.trim() !== "" && config.image.apiKey.trim() !== "" && config.fastmoss.apiKey.trim() !== "",
  };
}

function cleanPatch<T extends object>(patch: Partial<T> | undefined): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (typeof value === "string" && value.trim() === "") continue;
    output[key] = value;
  }
  return output as Partial<T>;
}

export async function getKeysStatus(): Promise<KeysStatus> {
  return toStatus(await readKeysConfig());
}

export function saveKeys(input: SaveKeysInput): Promise<KeysStatus> {
  // 排队串行执行，返回本次结果；前一次失败不阻塞后一次。
  const run = saveQueue.then(() => saveKeysNow(input));
  saveQueue = run.catch(() => undefined);
  return run;
}

// 端点换了但没同时提交新 Key 时清空旧 Key：防止旧 Key 被送到新的接口地址（Key 与端点绑定）。
function clearKeyOnOriginChange<T extends { apiKey: string; baseUrl: string }>(next: T, patch: Partial<T> | undefined, current: T): T {
  if (!patch || patch.baseUrl === undefined) return next;
  if (originOf(patch.baseUrl) === originOf(current.baseUrl)) return next;
  if (patch.apiKey !== undefined && patch.apiKey.trim() !== "") return next;
  return { ...next, apiKey: "" };
}

async function saveKeysNow(input: SaveKeysInput): Promise<KeysStatus> {
  const current = await readKeysConfig();
  const next: KeysConfig = {
    llm: { ...current.llm, ...cleanPatch(input.llm) },
    image: { ...current.image, ...cleanPatch(input.image) },
    fastmoss: { ...current.fastmoss, ...cleanPatch(input.fastmoss) },
  };
  next.llm = clearKeyOnOriginChange(next.llm, input.llm, current.llm);
  next.image = clearKeyOnOriginChange(next.image, input.image, current.image);
  next.fastmoss = clearKeyOnOriginChange(next.fastmoss, input.fastmoss, current.fastmoss);
  await writeKeysConfig(next);
  return toStatus(next);
}
