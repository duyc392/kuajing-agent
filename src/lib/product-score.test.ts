// 用途：候选品打分单测：满分/零分边界、红线标记、权重合计与等级映射。
import test from "node:test";
import assert from "node:assert/strict";
import { computeCandidateScore } from "@/lib/product-score";
import { SCORE_WEIGHTS } from "@/config/selection";

test("打分权重合计为 1", () => {
  const sum = Object.values(SCORE_WEIGHTS).reduce((total, weight) => total + weight, 0);
  assert.equal(Number(sum.toFixed(6)), 1);
});

test("全部指标拉满时得 S 级且无红线", () => {
  const result = computeCandidateScore({
    monthlySales: 20000,
    weeklyGrowth: 900,
    shopCount: 0,
    sellingPrice: 30,
    netProfit: 15,
    netMarginRate: 0.6,
  });
  assert.equal(result.score, 100);
  assert.equal(result.grade, "S");
  assert.deepEqual(result.redFlags, []);
  assert.equal(result.breakdown.length, 5);
});

test("负毛利触发红线并降级", () => {
  const result = computeCandidateScore({
    monthlySales: 100,
    weeklyGrowth: 0,
    shopCount: 180,
    sellingPrice: 30,
    netProfit: -2,
    netMarginRate: -0.1,
  });
  assert.equal(result.grade, "D");
  assert.ok(result.redFlags.some((flag) => flag.includes("贡献毛利")));
  assert.ok(result.redFlags.some((flag) => flag.includes("淘汰线")));
});

test("价格带之外会扣分，但落在区间内给满分", () => {
  const inside = computeCandidateScore({
    monthlySales: 0, weeklyGrowth: 0, shopCount: 200, sellingPrice: 30, netProfit: 1, netMarginRate: 0.1,
    targetPrice: { min: 20, max: 40 },
  });
  const outside = computeCandidateScore({
    monthlySales: 0, weeklyGrowth: 0, shopCount: 200, sellingPrice: 100, netProfit: 1, netMarginRate: 0.1,
    targetPrice: { min: 20, max: 40 },
  });
  const bandOf = (result: typeof inside) => result.breakdown.find((item) => item.key === "priceBand")?.normalized;
  assert.equal(bandOf(inside), 1);
  assert.equal(bandOf(outside), 0);
  assert.ok(outside.score < inside.score);
});
