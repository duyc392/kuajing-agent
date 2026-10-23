// 用途：分镜编排域类型：分镜三要素（画面/口播/字幕）+ 生图提示词与音频指令的结构契约，以及校验与引文核查结果。
// 校验是两个独立原子工具（validate_storyboard / verify_citations）的确定性输出，只报告问题，不改写内容。

export const VALIDATE_STORYBOARD_TOOL_NAME = "validate_storyboard";
export const VERIFY_CITATIONS_TOOL_NAME = "verify_citations";
export const SAVE_VIDEO_SCRIPT_TOOL_NAME = "save_video_script";

/** 分镜叙事阶段：与五段式结构一一对应。 */
export const STORY_PHASES = ["hook", "pain", "demo", "proof", "cta"] as const;
export type StoryPhase = (typeof STORY_PHASES)[number];

/** Hook 分类：拆解与编排共用同一枚举，避免两边各写一套叫法。 */
export const HOOK_TYPES = ["悬念反问型", "痛点暴击型", "视觉冲突型", "利益诱导型", "身份认同型"] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export interface StoryboardShotInput {
  index: number;
  phase: StoryPhase;
  seconds: number;
  /** 中文拍摄/剪辑指令 */
  visual: string;
  /** 英文生图提示词（交给生图模型，正文只允许 ASCII） */
  imagePrompt: string;
  voiceover: string;
  subtitle: string;
  audioNote: string;
  onScreenText?: string;
  /** 关联的痛点编号（如 P1），用于校验痛点是否真的落到分镜里 */
  painPointId?: string;
}

export interface StoryboardValidationDetails {
  valid: boolean;
  totalSeconds: number;
  expectedSeconds: number;
  shotCount: number;
  problems: string[];
}

export interface CitationInput {
  quote: string;
  label?: string;
}

export interface CitationProblem {
  quote: string;
  label: string;
  reason: string;
}

export interface CitationCheckDetails {
  valid: boolean;
  checked: number;
  problems: CitationProblem[];
}
