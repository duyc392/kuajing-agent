// 用途：视频脚本业务域类型（PRD 故事 25-27）：分镜结构（画面/口播/字幕/秒数）、创建与修改契约、列表/详情视图与聊天工具结果数据。
export const SCRIPT_TOOL_NAME = "generate_video_script";

// 单个分镜：画面描述（中文便于拍摄）、口播与字幕（目标市场语言）、时长（秒）。
export interface ScriptShot {
  scene: string;
  voiceover: string;
  subtitle: string;
  seconds: number;
}

export interface ScriptCreateInput {
  shopId: string;
  productId: string | null;
  type: string;
  duration: number;
  hook: string;
  cta: string;
  style: string | null;
  shots: ScriptShot[];
}

// 修改契约：仅文本字段可人工修改；总时长由分镜秒数决定、分镜经对话重新生成，均不可直接修改。
export interface ScriptUpdateInput {
  type?: string;
  hook?: string;
  cta?: string;
  style?: string | null;
}

export interface ScriptSummary {
  id: string;
  type: string;
  duration: number;
  hook: string;
  style: string | null;
  productName: string | null;
  version: number;
  parentScriptId: string | null;
  updatedAt: string;
}

export interface ScriptDetailView {
  id: string;
  productId: string | null;
  type: string;
  duration: number;
  hook: string;
  cta: string;
  style: string | null;
  shots: ScriptShot[];
  version: number;
  parentScriptId: string | null;
  updatedAt: string;
}

export interface ScriptToolDetails {
  scriptId: string;
  type: string;
  duration: number;
  hook: string;
  cta: string;
  shotCount: number;
  language: string;
}
