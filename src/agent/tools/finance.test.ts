// 用途：财务与打分工具单测：确定性公式透传、文本可读、负利提示与 S 级结果。
import test from "node:test";
import assert from "node:assert/strict";
import { createScoreCandidateTool, createUnitEconomicsTool } from "@/agent/tools/finance";
import { firstText } from "@/agent/tools/tool-test-utils";
import { computeSelectionFinance } from "@/lib/selection-finance";
import { CREATOR_COMMISSION_RATE, PLATFORM_FEE_RATE, REFUND_RESERVE_RATE, USD_TO_RMB } from "@/config/selection";

test("calc_unit_economics：透传财务结果并给出可转述文本", async () => {
  const tool = createUnitEconomicsTool();
  const result = await tool.execute("call-1", { sellingPrice: 29.99, costRmb: 22, shippingFee: 3.94 });
  const expected = computeSelectionFinance({
    region: "US",
    sellingPrice: 29.99,
    costRmb: 22,
    weightGrams: 0,
    shippingFee: 3.94,
    fxRate: USD_TO_RMB,
    platformRate: PLATFORM_FEE_RATE,
    commissionRate: CREATOR_COMMISSION_RATE,
    refundRate: REFUND_RESERVE_RATE,
  });
  assert.equal(result.details.netProfit, expected.netProfit);
  assert.equal(result.details.breakevenRoas, expected.breakevenRoas);
  assert.match(firstText(result.content), /贡献毛利/);
  assert.doesNotMatch(firstText(result.content), /不该推进/);
});

test("calc_unit_economics：贡献毛利不为正时明确提示不要推进", async () => {
  const tool = createUnitEconomicsTool();
  const result = await tool.execute("call-1", { sellingPrice: 5, costRmb: 100, shippingFee: 10 });
  assert.ok(result.details.netProfit <= 0);
  assert.match(firstText(result.content), /不该推进/);
});

test("score_candidate：满分候选得 S 级并列出红线状态", async () => {
  const tool = createScoreCandidateTool();
  const result = await tool.execute("call-1", {
    monthlySales: 20000,
    weeklyGrowth: 900,
    shopCount: 0,
    sellingPrice: 30,
    netProfit: 15,
    netMarginRate: 0.6,
  });
  assert.equal(result.details.score, 100);
  assert.equal(result.details.grade, "S");
  assert.match(firstText(result.content), /综合得分 100（S 级）/);
  assert.match(firstText(result.content), /未触发红线/);
});
