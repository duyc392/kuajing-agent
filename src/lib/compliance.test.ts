// 用途：合规扫描单测：命中分类与严重级别、白名单不误伤、位置下标对应原文、无命中时 passed=true。
import test from "node:test";
import assert from "node:assert/strict";
import { scanCompliance } from "@/lib/compliance";

test("合规扫描：医疗与绝对化用语命中并给替换建议", () => {
  const result = scanCompliance("This cream cures acne in 3 days, 100% guaranteed!");
  assert.equal(result.passed, false);
  assert.equal(result.riskLevel, "high");
  const terms = result.matches.map((match) => match.term.toLowerCase());
  assert.ok(terms.includes("cures"));
  assert.ok(terms.includes("100%"));
  assert.ok(terms.includes("guaranteed"));
  assert.ok(result.matches.some((match) => match.category === "medical" && match.severity === "high"));
  assert.ok(result.matches.every((match) => match.suggestion !== ""));
});

test("合规扫描：命中下标能定位回原文", () => {
  const text = "hello best seller world";
  const result = scanCompliance(text);
  const match = result.matches.find((item) => item.term.toLowerCase().includes("best"));
  assert.ok(match);
  assert.equal(text.slice(match.index, match.index + match.term.length).toLowerCase(), match.term.toLowerCase());
});

test("合规扫描：白名单短语不误伤，正常文案通过", () => {
  const result = scanCompliance("best regards, this is a normal product description");
  assert.equal(result.passed, true);
  assert.equal(result.riskLevel, "none");
});

test("合规扫描：中文违禁词命中 high", () => {
  const result = scanCompliance("这款宠物药可以治疗皮肤病，百分百有效");
  assert.equal(result.riskLevel, "high");
  assert.ok(result.matches.some((match) => match.term === "治疗"));
  assert.ok(result.matches.some((match) => match.term === "百分百"));
});
