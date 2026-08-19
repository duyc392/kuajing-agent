// 用途：直播流程业务结构规则（PRD 故事 28：开场、讲解顺序、互动、促销节奏）：
// 服务端创建/修改校验、Agent 生成重试判断、前端编辑表单即时提示共用同一份规则，
// 保证任何入口产出的直播脚本都仍是"符合需求的直播流程"。
import type { LiveSegment } from "@/types";

// 一场符合要求的带货直播必须包含的四个环节（按阶段名做包含匹配，兼容"商品讲解顺序"等变体命名）。
export const LIVE_FLOW_REQUIRED_PHASES = ["开场", "讲解", "互动", "促销"] as const;

// 返回结构违规原因列表；空数组表示结构符合要求。
export function liveFlowStructureProblems(segments: LiveSegment[]): string[] {
  if (segments.length === 0) return ["直播脚本至少需要一个阶段"];
  const problems: string[] = [];
  const first = segments[0];
  if (!first.phase.includes("开场")) problems.push(`第一个阶段必须是开场阶段，当前是「${first.phase}」`);
  const joinedPhases = segments.map((segment) => segment.phase).join(" ");
  for (const keyword of LIVE_FLOW_REQUIRED_PHASES) {
    if (!joinedPhases.includes(keyword)) problems.push(`缺少「${keyword}」环节`);
  }
  return problems;
}
