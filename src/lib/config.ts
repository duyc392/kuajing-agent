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
    // 原始错误只进服务端日志，前端只收到固定中文提示（不泄露磁盘路径等系统细节）。
    console.error("[config] 配置文件读取失败:", error);
    throw new AppError("配置文件无法读取，请检查 data/config.json 是否存在且可访问。", "CONFIG_READ_ERROR", 500);
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
  const filePath = getConfigPath();
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // 原子写：先写临时文件再改名覆盖，进程中断也不会留下半截 JSON。
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
    await fs.chmod(tmpPath, 0o600).catch(() => undefined);
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    console.error("[config] 配置文件写入失败:", error);
    throw new AppError("配置文件写入失败，请检查 data 目录是否可写。", "CONFIG_WRITE_ERROR", 500);
  }
}
