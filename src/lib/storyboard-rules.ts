// 用途：分镜结构校验（纯函数，无 IO）：时长求和、首镜 3 秒、五段覆盖、三要素齐全、英文生图提示词、痛点关联。
// 只报告问题清单，不改写内容；主 Agent 按 Skill SOP 自行修正后再次调用本函数对应的工具复验。
import { STORY_PHASES, type StoryboardShotInput, type StoryboardValidationDetails } from "@/types";

const HOOK_MAX_SECONDS = 3;
const SUBTITLE_MAX_CHARS = 90;
const ASCII_ONLY = /^[\x20-\x7E]+$/;

export interface StoryboardValidationInput {
  shots: StoryboardShotInput[];
  expectedSeconds: number;
}

function fieldProblems(shot: StoryboardShotInput, at: number): string[] {
  const problems: string[] = [];
  const prefix = `第 ${at} 镜`;
  if (shot.visual.trim() === "") problems.push(`${prefix}缺少中文画面指令`);
  if (shot.voiceover.trim() === "") problems.push(`${prefix}缺少口播`);
  if (shot.subtitle.trim() === "") problems.push(`${prefix}缺少字幕`);
  if (shot.audioNote.trim() === "") problems.push(`${prefix}缺少音频/BGM 指令`);
  if (!Number.isInteger(shot.seconds) || shot.seconds <= 0) problems.push(`${prefix}时长必须是正整数秒`);
  if (shot.subtitle.length > SUBTITLE_MAX_CHARS) problems.push(`${prefix}字幕超过 ${SUBTITLE_MAX_CHARS} 字符，屏幕放不下`);
  if (shot.imagePrompt.trim() === "") {
    problems.push(`${prefix}缺少英文生图提示词`);
  } else if (!ASCII_ONLY.test(shot.imagePrompt)) {
    problems.push(`${prefix}生图提示词必须是英文（含中文或全角字符）`);
  }
  return problems;
}

function phaseProblems(shots: StoryboardShotInput[]): string[] {
  const phases = new Set(shots.map((shot) => shot.phase));
  return STORY_PHASES.filter((phase) => !phases.has(phase)).map((phase) => `缺少「${phase}」阶段的分镜`);
}

export function validateStoryboard(input: StoryboardValidationInput): StoryboardValidationDetails {
  const problems: string[] = [];
  if (input.shots.length === 0) {
    return { valid: false, totalSeconds: 0, expectedSeconds: input.expectedSeconds, shotCount: 0, problems: ["分镜不能为空"] };
  }
  const totalSeconds = input.shots.reduce((sum, shot) => sum + (Number.isFinite(shot.seconds) ? shot.seconds : 0), 0);
  input.shots.forEach((shot, index) => {
    problems.push(...fieldProblems(shot, index + 1));
    if (shot.index !== index + 1) problems.push(`第 ${index + 1} 镜的 index 应为 ${index + 1}（当前 ${shot.index}）`);
    if (!STORY_PHASES.includes(shot.phase)) problems.push(`第 ${index + 1} 镜阶段取值非法：${shot.phase}`);
  });
  const first = input.shots[0];
  if (first.seconds > HOOK_MAX_SECONDS) problems.push(`第一个镜头 ${first.seconds} 秒，超过 3 秒的钩子上限`);
  if (first.phase !== "hook") problems.push("第一个镜头必须是 hook 阶段");
  if (totalSeconds !== input.expectedSeconds) problems.push(`分镜时长合计 ${totalSeconds} 秒，与目标 ${input.expectedSeconds} 秒不一致`);
  problems.push(...phaseProblems(input.shots));
  if (!input.shots.some((shot) => (shot.painPointId ?? "").trim() !== "")) {
    problems.push("至少一个分镜要关联具体痛点（painPointId），证明卖点有出处");
  }
  return { valid: problems.length === 0, totalSeconds, expectedSeconds: input.expectedSeconds, shotCount: input.shots.length, problems };
}
