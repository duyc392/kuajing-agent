// 用途：选品工作台配置与确定性规则：市场与类目、汇率、费率、美区阶梯运费与英/印模拟运费（SPEC 第 3 章）、
// 候选决策状态阈值，以及选品服务/推进服务/前端重算共用的默认财务精算入口。
import { computeSelectionFinance, round2 } from "@/lib/selection-finance";
import type { SelectionFinanceResult, SelectionRegion } from "@/types";

// 三种货币当前统一基准：美区汇率 1 USD = 7.1425 CNY（SPEC 3.3）。
export const USD_TO_RMB = 7.1425;

// 售价的固定扣减费率：平台抽点 / 达人佣金 / 售后损耗预留。
export const PLATFORM_FEE_RATE = 0.05;
export const CREATOR_COMMISSION_RATE = 0.15;
export const REFUND_RESERVE_RATE = 0.03;

// 美区阶梯运费：首 100g 统一 $2.50，超出部分每克 $0.012（SPEC 3.2）。
export const US_SHIPPING_BASE_USD = 2.5;
export const US_SHIPPING_FREE_WEIGHT_GRAMS = 100;
export const US_SHIPPING_PER_GRAM_USD = 0.012;

// 英/印当前为模拟运费（无真实物流接口），按固定汇率折算成 USD 参与财务计算（计算域统一美元）：
// 英国约 £2.50~£3.80（1 GBP ≈ 1.2668 USD）、印尼约 Rp25,000~Rp35,000（1 USD ≈ 16,200 IDR）；
// 展示侧在运费列注明原始币种区间并带 [模拟] 徽标，绝不作真实计费。
export const UK_SHIPPING_SIM_USD = { min: 3.16, max: 4.81 };
export const ID_SHIPPING_SIM_USD = { min: 1.54, max: 2.16 };
export const SHIPPING_SIM_NOTE = "英/印运费为模拟值：英国约 £2.50~£3.80、印尼约 Rp25,000~Rp35,000，按固定汇率折算美元";

// 固定汇率（展示注明）：英磅兑美元、印尼卢比兑美元（每美元卢比数）。
export const GBP_PER_USD = 0.79;
export const IDR_PER_USD = 16200;

// 权重车默认过滤阈值、默认费率与候选决策阈值：killMarginRate/recommendGrowthRate 供服务端派生与前端重算共用；
// weightFilterOffGrams 为关闭重量过滤时的大上限（哨兵值，恒大于任何候选重量）。
export const SELECTION_DEFAULTS = {
  priceRange: { min: 20, max: 40 },
  minMarginRate: 0.45,
  maxWeightGrams: 500,
  lowMarginAlertRate: 0.4,
  killMarginRate: 0.3,
  recommendGrowthRate: 200,
  weightFilterOffGrams: 99999,
} as const;

export const SELECTION_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "Beauty", label: "美妆个护 (Beauty & Personal Care)" },
  { value: "Home", label: "家居厨房 (Home & Kitchen)" },
  { value: "3C", label: "3C数码配件 (Electronics)" },
  { value: "Outdoor", label: "户外运动 (Sports & Outdoors)" },
];

// 美区阶梯运费（确定性公式）；英/印由模拟运费函数给出并按候选品打 [模拟] 标记。
function usShippingFee(weightGrams: number): number {
  const weight = Math.max(0, weightGrams);
  if (weight <= US_SHIPPING_FREE_WEIGHT_GRAMS) return round2(US_SHIPPING_BASE_USD);
  return round2(US_SHIPPING_BASE_USD + (weight - US_SHIPPING_FREE_WEIGHT_GRAMS) * US_SHIPPING_PER_GRAM_USD);
}

// 英/印模拟运费：按重量在（折算后的）美元区间内线性映射，仅用于内部测算并显式标注模拟。
function simulatedShippingFee(region: "UK" | "ID", weightGrams: number): number {
  const props = region === "UK" ? UK_SHIPPING_SIM_USD : ID_SHIPPING_SIM_USD;
  const spread = props.max - props.min;
  const ratio = Math.min(1, Math.max(0, weightGrams / SELECTION_DEFAULTS.maxWeightGrams));
  return round2(props.min + spread * ratio);
}

// 运费统一入口：美区走阶梯公式；英/印走模拟运费。返回值说明该运费是否模拟。
export function calcShippingFee(region: "US" | "UK" | "ID", weightGrams: number): { fee: number; simulated: boolean } {
  if (region === "US") return { fee: usShippingFee(weightGrams), simulated: false };
  return { fee: simulatedShippingFee(region, weightGrams), simulated: true };
}

// 默认财务精算：统一汇率与固定费率，运费按市场规则自动确定；selection.service、推进服务与前端重算共用同一入口，
// 保证三处公式绝不漂移。commissionRate 可传入模拟值（沙盒佣金模拟），缺省用固定达人佣金率。
export function computeDefaultFinance(input: { region: SelectionRegion; sellingPrice: number; costRmb: number; weightGrams: number; commissionRate?: number }): SelectionFinanceResult {
  const { fee } = calcShippingFee(input.region, input.weightGrams);
  return computeSelectionFinance({
    region: input.region,
    sellingPrice: input.sellingPrice,
    costRmb: input.costRmb,
    weightGrams: input.weightGrams,
    shippingFee: fee,
    fxRate: USD_TO_RMB,
    platformRate: PLATFORM_FEE_RATE,
    commissionRate: input.commissionRate ?? CREATOR_COMMISSION_RATE,
    refundRate: REFUND_RESERVE_RATE,
  });
}

// 候选决策状态规则（服务端派生与前端重算共用）：负利或毛利低于淘汰线 → 已淘汰；
// 毛利达默认下限且周增速达推荐线 → 建议测品；其余候选保留。
export function refineStatusOf(input: { netProfit: number; netMarginRate: number; weeklyGrowth: number }): "建议测品" | "候选保留" | "已淘汰" {
  if (input.netProfit <= 0 || input.netMarginRate < SELECTION_DEFAULTS.killMarginRate) return "已淘汰";
  if (input.netMarginRate >= SELECTION_DEFAULTS.minMarginRate && input.weeklyGrowth >= SELECTION_DEFAULTS.recommendGrowthRate) return "建议测品";
  return "候选保留";
}

// 视频透视参考地址（模拟阶段）：由候选品 ID 派生稳定占位地址，接真实视频源后在 getVideoInsight 的替换点切换。
export function mockVideoUrlOf(candidateId: string): string {
  return `https://mock-videos.tiktok.local/${encodeURIComponent(candidateId)}.mp4`;
}
