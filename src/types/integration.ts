// 用途：素材生产与外部归档域类型：固定工作流出图、本土化 TTS 与飞书/Notion 归档的结果契约。
// 这些工具只负责「按给定输入执行并返回产物路径」，提示词与文案由主 Agent 按 Skill 产出后传入。

export const GENERATE_TTS_TOOL_NAME = "generate_localized_tts";
export const EXPORT_INTEGRATION_TOOL_NAME = "export_to_feishu_or_notion";

export interface TtsRunDetails {
  language: string;
  voiceId: string;
  audioPublicPath: string;
  audioDiskPath: string;
  srtPublicPath: string;
  srtDiskPath: string;
  durationSeconds: number;
}

export interface SavedImageRecordDetails {
  productId: string;
  imageIds: string[];
  appliedCount: number;
}

export type ExportProvider = "feishu" | "notion";

export const EXPORT_RESOURCES = ["selection-report", "storyboard", "script"] as const;
export type ExportResource = (typeof EXPORT_RESOURCES)[number];

export interface ExportResultDetails {
  provider: ExportProvider;
  resource: ExportResource;
  externalId: string;
  url: string | null;
  fieldCount: number;
}
