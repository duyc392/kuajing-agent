// 用途：固定出图工作流模板单测：占位符填充、空白压缩、必填项校验、参考图要求与自由出图的差异。
import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_WORKFLOW_TEMPLATES, buildWorkflowPrompt, requiresReference } from "@/lib/image-workflows";
import { IMAGE_WORKFLOWS } from "@/types";

test("每个工作流都有模板、说明与参考图要求", () => {
  for (const workflow of IMAGE_WORKFLOWS) {
    const template = IMAGE_WORKFLOW_TEMPLATES[workflow];
    assert.ok(template.template.includes("{{subject}}"), `${workflow} 缺少 subject 占位符`);
    assert.ok(template.template.includes("{{scene}}"), `${workflow} 缺少 scene 占位符`);
    assert.equal(typeof requiresReference(workflow), "boolean");
  }
});

test("换背景与换装必须提供商品原图，纯文生图与分镜草图不要求", () => {
  assert.equal(requiresReference("background-replace"), true);
  assert.equal(requiresReference("model-swap"), true);
  assert.equal(requiresReference("text-to-image"), false);
  assert.equal(requiresReference("storyboard"), false);
});

test("模板填充后无占位符残留，且只含 ASCII 字符", () => {
  const prompt = buildWorkflowPrompt("background-replace", "matte black water bottle", "sunlit kitchen counter");
  assert.ok(!prompt.includes("{{"));
  assert.ok(prompt.includes("matte black water bottle"));
  assert.ok(prompt.includes("sunlit kitchen counter"));
  assert.match(prompt, /^[\x20-\x7E]+$/);
});

test("多余空白会被压缩成单个空格", () => {
  const prompt = buildWorkflowPrompt("text-to-image", "  a  ceramic mug ", "  white  table ");
  assert.ok(!prompt.includes("  "));
  assert.ok(prompt.includes("a ceramic mug"));
});

test("主体或场景为空时直接报错", () => {
  assert.throws(() => buildWorkflowPrompt("text-to-image", "   ", "white table"), /subject 不能为空/);
  assert.throws(() => buildWorkflowPrompt("text-to-image", "a mug", "  "), /scene 不能为空/);
});
