// 用途：直播流程结构单测：空脚本、首阶段非开场、四环节缺失与合法流程。
import test from "node:test";
import assert from "node:assert/strict";
import { LIVE_FLOW_REQUIRED_PHASES, liveFlowStructureProblems } from "@/lib/live-flow";
import type { LiveSegment } from "@/types";

function segment(phase: string): LiveSegment {
  return { phase, minutes: 5, goal: "目标", script: "话术" };
}

test("空脚本至少需要一个阶段", () => {
  assert.deepEqual(liveFlowStructureProblems([]), ["直播脚本至少需要一个阶段"]);
});

test("首阶段不是开场要报错", () => {
  const problems = liveFlowStructureProblems([segment("商品讲解"), segment("开场"), segment("互动"), segment("促销")]);
  assert.ok(problems.some((problem) => problem.includes("第一个阶段必须是开场")));
});

test("缺少任一必需环节都要报错", () => {
  const problems = liveFlowStructureProblems([segment("开场")]);
  for (const phase of LIVE_FLOW_REQUIRED_PHASES) {
    if (phase === "开场") continue;
    assert.ok(problems.some((problem) => problem.includes(phase)));
  }
});

test("开场 + 讲解 + 互动 + 促销的完整流程通过", () => {
  assert.deepEqual(
    liveFlowStructureProblems([segment("开场"), segment("商品讲解顺序"), segment("互动抽奖"), segment("限时促销")]),
    [],
  );
});
