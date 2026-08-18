// 用途：读写服务端本地配置文件 data/config.json（三个 Key 与模型选择，Key 不暴露给前端）。
import { promises as fs } from "fs";
import path from "path";
import { FASTMOSS_DEFAULTS, IMAGE_DEFAULTS, LLM_DEFAULTS } from "@/config/models";
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
  try {
    const raw = await fs.readFile(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<KeysConfig>;
    const defaults = buildDefaults();
    return {
      llm: { ...defaults.llm, ...parsed.llm },
      image: { ...defaults.image, ...parsed.image },
      fastmoss: { ...defaults.fastmoss, ...parsed.fastmoss },
    };
  } catch {
    return buildDefaults();
  }
}

export async function writeKeysConfig(config: KeysConfig): Promise<void> {
  await fs.mkdir(path.dirname(getConfigPath()), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}
