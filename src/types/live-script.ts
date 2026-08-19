// 用途：直播脚本业务域类型（PRD 故事 28 与页面清单第 5 项）：流程阶段结构（开场/讲解/互动/促销节奏）、
// 创建与修改契约、列表/详情视图与聊天工具结果数据。数据库时长存秒，界面与模型交互用分钟。
export const LIVE_SCRIPT_TOOL_NAME = "generate_live_script";

// 单个流程阶段：阶段名（含开场/讲解/互动/促销等）、时长（分钟）、阶段目标、关键话术（目标市场语言）。
export interface LiveSegment {
  phase: string;
  minutes: number;
  goal: string;
  script: string;
}

export interface LiveScriptCreateInput {
  shopId: string;
  duration: number; // 秒（= 各阶段分钟数总和 × 60）
  productNames: string[];
  segments: LiveSegment[];
}

// 修改契约：只允许整段流程重写（总时长由阶段分钟数重算，不允许单独改时长，保持两者永远一致）。
export interface LiveScriptUpdateInput {
  segments: LiveSegment[];
}

export interface LiveScriptSummary {
  id: string;
  duration: number; // 秒
  productNames: string[];
  segmentCount: number;
  updatedAt: string;
}

export interface LiveScriptDetailView {
  id: string;
  duration: number; // 秒
  productNames: string[];
  segments: LiveSegment[];
  updatedAt: string;
}

export interface LiveScriptToolDetails {
  liveScriptId: string;
  durationMinutes: number;
  segmentCount: number;
  productCount: number;
  language: string;
}
