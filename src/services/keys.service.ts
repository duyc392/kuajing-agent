// 用途：密钥业务逻辑：读取三项密钥的脱敏状态、合并保存用户提交的密钥到本地配置文件（全文只存在服务端）。
import { readKeysConfig, writeKeysConfig } from "@/lib/config";
import type { KeyGroupStatus, KeysConfig, KeysStatus, SaveKeysInput } from "@/types";

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

export async function saveKeys(input: SaveKeysInput): Promise<KeysStatus> {
  const current = await readKeysConfig();
  const next: KeysConfig = {
    llm: { ...current.llm, ...cleanPatch(input.llm) },
    image: { ...current.image, ...cleanPatch(input.image) },
    fastmoss: { ...current.fastmoss, ...cleanPatch(input.fastmoss) },
  };
  await writeKeysConfig(next);
  return toStatus(next);
}
