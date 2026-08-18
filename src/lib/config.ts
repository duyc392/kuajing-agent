// 用途：读写服务端本地配置文件 data/config.json（三个 Key 与模型选择，Key 不暴露给前端）。
import { promises as fs } from "fs";
import path from "path";
import { FASTMOSS_DEFAULTS, IMAGE_DEFAULTS, LLM_DEFAULTS } from "@/config/models";
import { AppError } from "@/lib/errors";
import type { KeysConfig } from "@/types";

export function getConfigPath(): string {
  return path.join(process.cwd(), "data", "config.json");
}

function buildDefaults(): KeysConfig {
  return {
    llm: { apiKey: "", ...LLM_DEFAULTS },
    image: { apiKey: "", ...IMAGE_DEFAULTS },
    fastmoss: { apiKey: "", ...FASTMOSS_DEFAULTS },
  };
}

export async function readKeysConfig(): Promise<KeysConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(getConfigPath(), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return buildDefaults();
    throw new AppError(
      `配置文件无法读取：${error instanceof Error ? error.message : "未知错误"}`,
      "CONFIG_READ_ERROR",
      500,
    );
  }
  let parsed: Partial<KeysConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<KeysConfig>;
  } catch {
    throw new AppError(
      "配置文件 data/config.json 已损坏（不是合法 JSON）。请删除该文件后重新在引导页配置。",
      "CONFIG_CORRUPT",
      500,
    );
  }
  const defaults = buildDefaults();
  return {
    llm: { ...defaults.llm, ...parsed.llm },
    image: { ...defaults.image, ...parsed.image },
    fastmoss: { ...defaults.fastmoss, ...parsed.fastmoss },
  };
}

export async function writeKeysConfig(config: KeysConfig): Promise<void> {
  try {
    await fs.mkdir(path.dirname(getConfigPath()), { recursive: true });
    await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new AppError(
      `配置文件写入失败：${error instanceof Error ? error.message : "未知错误"}`,
      "CONFIG_WRITE_ERROR",
      500,
    );
  }
}
