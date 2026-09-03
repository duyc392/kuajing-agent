// 用途：选品财务精算纯函数（SPEC 第 3 章唯一标准）：平台抽点 / 达人佣金 / 售后损耗 / 采购成本换算 / 运费扣减相加得总成本，
// 再得单件贡献毛利、贡献毛利率、保本 Max CPA 与保本 ROAS。禁止用大模型做任何算术估算；
// 本文件只做数学，不读配置、不碰数据源：费率与运费由调用方（selection.service / 前端表格重算）经 config/selection 传入。
import type { SelectionFinanceInput, SelectionFinanceResult } from "@/types";

export const ROUND_DIGITS = 2;

// 金额两位小数舍入（SPEC 3.3：所有中间与最终金额统一保留 2 位）。
export function round2(value: number): number {
  return Number(value.toFixed(ROUND_DIGITS));
}

// 毛利率四位小数（如 0.4720 展示为 47.2%）。
export function round4(value: number): number {
  return Number(value.toFixed(4));
}

// 除零保护：MaxCPA 不为正时 ROAS 无意义，按 SPEC 3.3 返回 999.00。
function safeRoas(sellingPrice: number, maxCpa: number): number {
  if (maxCpa <= 0) return 999.0;
  return round2(sellingPrice / maxCpa);
}

// 财务五要素 → 总成本 → 单件贡献毛利与 Max CPA → 毛利率与保本 ROAS。
export function computeSelectionFinance(input: SelectionFinanceInput): SelectionFinanceResult {
  const platformFee = round2(input.sellingPrice * input.platformRate);
  const creatorComm = round2(input.sellingPrice * input.commissionRate);
  const refundReserve = round2(input.sellingPrice * input.refundRate);
  const costTarget = round2(input.costRmb / input.fxRate);
  const shippingFee = round2(input.shippingFee);
  const totalCost = round2(costTarget + shippingFee + platformFee + creatorComm + refundReserve);
  const netProfit = round2(input.sellingPrice - totalCost);
  const netMarginRate = input.sellingPrice > 0 ? round4(netProfit / input.sellingPrice) : 0;
  return {
    costTarget,
    shippingFee,
    platformFee,
    creatorComm,
    refundReserve,
    totalCost,
    netProfit,
    netMarginRate,
    maxCpa: netProfit,
    breakevenRoas: safeRoas(input.sellingPrice, netProfit),
  };
}
