// 用途：手动候选品构造单测：美元价格域、固定佣金、三篇差异化脚本、模拟运费标记与占位 DNA。
import test from "node:test";
import assert from "node:assert/strict";
import { buildManualCandidate } from "@/lib/selection-manual-candidate";
import { CREATOR_COMMISSION_RATE } from "@/config/selection";

const INPUT = { name: "卷线充电器", category: "3C数码", sellingPrice: 24.99, costRmb: 15, weightGrams: 180 };

test("手动候选：基础字段与固定佣金", () => {
  const candidate = buildManualCandidate(INPUT, "US");
  assert.match(candidate.candidateId, /^manual-/);
  assert.equal(candidate.targetRegion, "US");
  assert.equal(candidate.name, INPUT.name);
  assert.equal(candidate.sellingPrice, 24.99);
  assert.equal(candidate.costRmb, 15);
  assert.equal(candidate.costEdited, true);
  assert.equal(candidate.commissionRate, CREATOR_COMMISSION_RATE);
  assert.equal(candidate.shippingSimulated, false);
  assert.equal(candidate.status, "候选保留");
});

test("手动候选：三篇差异化脚本且秒数总和等于时长", () => {
  const candidate = buildManualCandidate(INPUT, "US");
  assert.equal(candidate.builtInScripts.length, 3);
  assert.equal(new Set(candidate.builtInScripts.map((script) => script.type)).size, 3);
  for (const script of candidate.builtInScripts) {
    assert.equal(script.shots.reduce((sum, shot) => sum + shot.seconds, 0), script.duration);
  }
});

test("手动候选：非美区运费标记为模拟，DNA 字段非空", () => {
  const candidate = buildManualCandidate(INPUT, "ID");
  assert.equal(candidate.shippingSimulated, true);
  for (const value of Object.values(candidate.dna)) {
    assert.ok(value.length > 0);
  }
});
