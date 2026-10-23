// 用途：合规扫描工具单测：通过文案与命中文案的 details、文本输出一致。
import test from "node:test";
import assert from "node:assert/strict";
import { createComplianceTool } from "@/agent/tools/compliance";
import { firstText } from "@/agent/tools/tool-test-utils";

test("check_tiktok_compliance：正常文案通过", async () => {
  const tool = createComplianceTool();
  const result = await tool.execute("call-1", { text: "this is a normal product description" });
  assert.equal(result.details.passed, true);
  assert.match(firstText(result.content), /合规扫描通过/);
});

test("check_tiktok_compliance：违禁词命中并输出替换建议", async () => {
  const tool = createComplianceTool();
  const result = await tool.execute("call-1", { text: "This cream cures acne, 100% guaranteed!" });
  assert.equal(result.details.passed, false);
  assert.equal(result.details.riskLevel, "high");
  const text = firstText(result.content);
  assert.match(text, /合规扫描未通过/);
  assert.match(text, /cures/);
  assert.match(text, /100%/);
  assert.match(text, /请按建议改写后重新扫描/);
});
