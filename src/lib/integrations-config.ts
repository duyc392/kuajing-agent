// 用途：集成配置读取：从 data/config.json 的可选分组（tts / feishu / notion）与环境变量读取凭据与端点。
// 与 KeysConfig（llm / image / fastmoss 三个必填 Key）分开：这些是可选进阶能力，未配置时对应工具给中文引导而不是让整站配置失败。
// 生图不走这里：自由出图与固定工作流共用 KeysConfig 的 image 分组（同一个模型与 baseUrl）。
import { promises as fs } from "fs";
import { getConfigPath } from "@/lib/config";
import { FEISHU_DEFAULTS, NOTION_DEFAULTS, TTS_DEFAULTS } from "@/config/integrations";

export interface TtsSettings {
  apiKey: string;
  baseUrl: string;
  voiceId: string;
  modelId: string;
}

export interface FeishuSettings {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
  baseUrl: string;
}

export interface NotionSettings {
  apiKey: string;
  databaseId: string;
  baseUrl: string;
}

export interface IntegrationsConfig {
  tts: TtsSettings;
  feishu: FeishuSettings;
  notion: NotionSettings;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function group(parsed: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parsed[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function readRawConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(getConfigPath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    // 文件缺失或损坏时按未配置处理（KeysConfig 的读取会给出更准确的主配置错误）。
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[config] 集成配置读取失败，按未配置处理:", error);
    }
    return {};
  }
}

// 环境变量优先于配置文件，便于容器化部署时不落盘凭据。
export async function readIntegrationsConfig(): Promise<IntegrationsConfig> {
  const parsed = await readRawConfig();
  const tts = group(parsed, "tts");
  const feishu = group(parsed, "feishu");
  const notion = group(parsed, "notion");
  return {
    tts: {
      apiKey: process.env.ELEVENLABS_API_KEY || str(tts.apiKey),
      baseUrl: process.env.ELEVENLABS_BASE_URL || str(tts.baseUrl) || TTS_DEFAULTS.baseUrl,
      voiceId: process.env.ELEVENLABS_VOICE_ID || str(tts.voiceId) || TTS_DEFAULTS.voiceId,
      modelId: process.env.ELEVENLABS_MODEL_ID || str(tts.modelId) || TTS_DEFAULTS.modelId,
    },
    feishu: {
      appId: process.env.FEISHU_APP_ID || str(feishu.appId),
      appSecret: process.env.FEISHU_APP_SECRET || str(feishu.appSecret),
      appToken: process.env.FEISHU_BITABLE_APP_TOKEN || str(feishu.appToken),
      tableId: process.env.FEISHU_BITABLE_TABLE_ID || str(feishu.tableId),
      baseUrl: process.env.FEISHU_BASE_URL || str(feishu.baseUrl) || FEISHU_DEFAULTS.baseUrl,
    },
    notion: {
      apiKey: process.env.NOTION_API_KEY || str(notion.apiKey),
      databaseId: process.env.NOTION_DATABASE_ID || str(notion.databaseId),
      baseUrl: process.env.NOTION_BASE_URL || str(notion.baseUrl) || NOTION_DEFAULTS.baseUrl,
    },
  };
}
