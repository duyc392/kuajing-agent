// 用途：分镜校验单测：合格分镜通过、时长不符/首镜超 3 秒/缺阶段/中文生图提示词/缺痛点关联都要报错。
import test from "node:test";
import assert from "node:assert/strict";
import { validateStoryboard } from "@/lib/storyboard-rules";
import type { StoryboardShotInput } from "@/types";

function shot(overrides: Partial<StoryboardShotInput> & { index: number; phase: StoryboardShotInput["phase"]; seconds: number }): StoryboardShotInput {
  return {
    visual: "画面",
    imagePrompt: "close-up of a phone on a desk, soft light, 4k",
    voiceover: "Still charging twice a day?",
    subtitle: "Still charging twice a day?",
    audioNote: "静音 0.5 秒后鼓点",
    painPointId: "P1",
    ...overrides,
  };
}

function goodShots(): StoryboardShotInput[] {
  return [
    shot({ index: 1, phase: "hook", seconds: 3 }),
    shot({ index: 2, phase: "pain", seconds: 5 }),
    shot({ index: 3, phase: "demo", seconds: 10 }),
    shot({ index: 4, phase: "proof", seconds: 4 }),
    shot({ index: 5, phase: "cta", seconds: 4 }),
  ];
}

test("合格分镜通过（时长 26 秒）", () => {
  const result = validateStoryboard({ shots: goodShots(), expectedSeconds: 26 });
  assert.equal(result.valid, true, result.problems.join("；"));
  assert.equal(result.totalSeconds, 26);
});

test("时长不符要报错", () => {
  const result = validateStoryboard({ shots: goodShots(), expectedSeconds: 30 });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("不一致")));
});

test("首镜超过 3 秒要报错", () => {
  const shots = goodShots();
  shots[0] = shot({ index: 1, phase: "hook", seconds: 6 });
  shots[1] = shot({ index: 2, phase: "pain", seconds: 2 });
  const result = validateStoryboard({ shots, expectedSeconds: 26 });
  assert.ok(result.problems.some((problem) => problem.includes("超过 3 秒")));
});

test("缺阶段、中文提示词、无痛点关联都要报错", () => {
  const shots = [
    shot({ index: 1, phase: "hook", seconds: 3, imagePrompt: "手机特写，柔光", painPointId: "" }),
    shot({ index: 2, phase: "pain", seconds: 5, painPointId: "" }),
  ];
  const result = validateStoryboard({ shots, expectedSeconds: 8 });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("生图提示词必须是英文")));
  assert.ok(result.problems.some((problem) => problem.includes("缺少「demo」")));
  assert.ok(result.problems.some((problem) => problem.includes("至少一个分镜要关联具体痛点")));
});

test("空分镜直接判不通过", () => {
  const result = validateStoryboard({ shots: [], expectedSeconds: 30 });
  assert.equal(result.valid, false);
  assert.deepEqual(result.problems, ["分镜不能为空"]);
});
