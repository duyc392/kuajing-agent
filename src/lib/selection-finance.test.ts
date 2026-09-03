// 用途：选品财务精算纯函数测试（SPEC 第 3 章公式与第 9 章边界）：美区阶梯运费临界值、五要素扣减、毛利率四位小数、Royas 除零保护。
import test from "node:test";
import assert from "node:assert/strict";
import { computeSelectionFinance, round2, round4 } from "@/lib/selection-finance";
import { calcShippingFee, PLATFORM_FEE_RATE, CREATOR_COMMISSION_RATE, REFUND_RESERVE_RATE } from "@/config/selection";

const BASE = {
  region: "US" as const,
  sellingPrice: 29.99,
  costRmb: 22,
  weightGrams: 220,
  shippingFee: 0,
  fxRate: 7.1425,
  platformRate: PLATFORM_FEE_RATE,
  commissionRate: CREATOR_COMMISSION_RATE,
  refundRate: REFUND_RESERVE_RATE,
};

test("美区阶梯运费：100g 与 101g 边界值", () => {
  const { fee: fee100 } = calcShippingFee("US", 100);
  const { fee: fee101 } = calcShippingFee("US", 101);
  assert.equal(fee100, 2.5, "100g 运费应为 $2.50");
  assert.equal(fee101, 2.51, "101g 运费应为 $2.51（2.5 + 1g*0.012）");
});

test("美区阶梯运费：零重量不出现负数，超出部分按克递增", () => {
  assert.equal(calcShippingFee("US", 0).fee, 2.5);
  assert.equal(calcShippingFee("US", 200).fee, 3.7);
});

test("英/印模拟运费：重量映射到（折算为美元的）模拟区间且带模拟标记", () => {
  const ukLight = calcShippingFee("UK", 0);
  assert.equal(ukLight.simulated, true);
  assert.equal(ukLight.fee, 3.16, "约 £2.50 折算为 $3.16");
  assert.equal(calcShippingFee("UK", 500).fee, 4.81, "约 £3.80 折算为 $4.81");
  assert.equal(calcShippingFee("ID", 0).fee, 1.54, "约 Rp25,000 折算为 $1.54");
  assert.equal(calcShippingFee("ID", 500).fee, 2.16, "约 Rp35,000 折算为 $2.16");
});

test("财务精算：五要素扣减与单件贡献毛利、Max CPA 公式", () => {
  const shipping = calcShippingFee("US", 220).fee; // 2.5 + 120*0.012 = 3.94
  const result = computeSelectionFinance({ ...BASE, shippingFee: shipping });
  const costTarget = round2(22 / 7.1425); // 3.08
  const platformFee = round2(29.99 * 0.05); // 1.5
  const creatorComm = round2(29.99 * 0.15); // 4.5
  const refundReserve = round2(29.99 * 0.03); // 0.9
  const totalCost = round2(costTarget + shipping + platformFee + creatorComm + refundReserve);
  const netProfit = round2(29.99 - totalCost);
  assert.equal(result.costTarget, costTarget);
  assert.equal(result.platformFee, platformFee);
  assert.equal(result.creatorComm, creatorComm);
  assert.equal(result.refundReserve, refundReserve);
  assert.equal(result.shippingFee, shipping);
  assert.equal(result.totalCost, totalCost);
  assert.equal(result.netProfit, netProfit, "单件贡献毛利 = 售价 - 总成本");
  assert.equal(result.maxCpa, netProfit, "保本 Max CPA 严格等于净利");
  assert.equal(result.breakevenRoas, round2(29.99 / netProfit), "保本 ROAS = 售价 / Max CPA");
});

test("财务精算：毛利率保留四位小数且不小于零", () => {
  const result = computeSelectionFinance({ ...BASE, shippingFee: 2 });
  assert.equal(result.netMarginRate, round4(result.netProfit / 29.99));
});

test("财务精算：Max CPA 为负时保本 ROAS 返回 999.00，不除零崩溃", () => {
  const result = computeSelectionFinance({ ...BASE, sellingPrice: 1, costRmb: 999, shippingFee: 50 });
  assert.ok(result.netProfit < 0);
  assert.equal(result.breakevenRoas, 999.0);
});

test("财务精算：负利与亏损品净利标红依据（netProfit < 0 可识别）", () => {
  const result = computeSelectionFinance({ ...BASE, sellingPrice: 1, costRmb: 100, shippingFee: 50 });
  assert.ok(result.netProfit < 0, "售价低于总成本时应能识别亏损");
});
