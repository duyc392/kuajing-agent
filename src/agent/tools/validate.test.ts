// 用途：交付校验工具单测：引文逐字命中/改写失败、分镜合格/时长不符，文本与 details 一致。
import test from "node:test";
import assert from "node:assert/strict";
import { createValidateStoryboardTool, createVerifyCitationsTool } from "@/agent/tools/validate";
import { firstText } from "@/agent/tools/tool-test-utils";
import type { StoryboardShotInput } from "@/types";

function shot(index: number, phase: StoryboardShotInput["phase"], seconds: number): StoryboardShotInput {
  return {
    index,
    phase,
    seconds,
    visual: "画面",
    imagePrompt: "close-up of a charger, soft light, 4k",
    voiceover: "Still charging twice a day?",
    subtitle: "Still charging twice a day?",
    audioNote: "鼓点",
    painPointId: "P1",
  };
}

test("verify_citations：逐字命中通过，改写句失败", async () => {
  const tool = createVerifyCitationsTool();
  const corpus = "The battery dies after like four hours.";
  const ok = await tool.execute("call-1", { quotes: [{ quote: "battery dies after like four hours" }], corpus });
  assert.equal(ok.details.valid, true);
  assert.match(firstText(ok.content), /引文核查通过/);

  const bad = await tool.execute("call-2", { quotes: [{ quote: "battery only lasts a few hours", label: "P1" }], corpus });
  assert.equal(bad.details.valid, false);
  assert.match(firstText(bad.content), /引文核查未通过/);
  assert.match(firstText(bad.content), /找不到/);
});

test("validate_storyboard：合格分镜通过、时长不符失败", async () => {
  const tool = createValidateStoryboardTool();
  const shots = [
    shot(1, "hook", 3),
    shot(2, "pain", 5),
    shot(3, "demo", 10),
    shot(4, "proof", 4),
    shot(5, "cta", 4),
  ];
  const ok = await tool.execute("call-1", { shots, expectedSeconds: 26 });
  assert.equal(ok.details.valid, true);
  assert.match(firstText(ok.content), /分镜校验通过/);

  const bad = await tool.execute("call-2", { shots, expectedSeconds: 30 });
  assert.equal(bad.details.valid, false);
  assert.match(firstText(bad.content), /分镜校验未通过/);
  assert.ok(bad.details.problems.some((problem) => problem.includes("不一致")));
});
