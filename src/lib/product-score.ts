// 用途：候选品综合打分（纯函数，无 IO）：把毛利、周增速、销量、竞争度、价格带五项归一化后按固定权重加权，
// 输出 0-100 分、等级、逐项拆解与红线原因。权重与基准来自 config/selection，禁止模型自行估算任何分数。
import { SCORE_BASELINES, SCORE_WEIGHTS, SELECTION_DEFAULTS } from "@/config/selection";
import type { CandidateGrade, CandidateScoreDetails, ScoreBreakdownItem } from "@/types";

const MARGIN_CAP = 0.6; // 毛利率 60% 记满分

export interface CandidateScoreInput {
  monthlySales: number;
  weeklyGrowth: number;
  shopCount: number;
  sellingPrice: number;
  netProfit: number;
  netMarginRate: number;
  targetPrice?: { min: number; max: number };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// 价格带得分：落在目标区间内满分，偏离越远扣分越快（偏离 100% 价格带宽度得 0 分）。
function priceBandScore(price: number, band: { min: number; max: number }): number {
  const width = Math.max(band.max - band.min, 1);
  if (price >= band.min && price <= band.max) return 1;
  const distance = price < band.min ? band.min - price : price - band.max;
  return clamp01(1 - distance / width);
}

function normalize(input: CandidateScoreInput): Record<keyof typeof SCORE_WEIGHTS, number> {
  const band = input.targetPrice ?? SELECTION_DEFAULTS.priceRange;
  return {
    margin: clamp01(input.netMarginRate / MARGIN_CAP),
    growth: clamp01(input.weeklyGrowth / SCORE_BASELINES.weeklyGrowthCap),
    sales: clamp01(input.monthlySales / SCORE_BASELINES.monthlySalesCap),
    competition: clamp01(1 - input.shopCount / SCORE_BASELINES.shopCountCap),
    priceBand: priceBandScore(input.sellingPrice, band),
  };
}

const LABELS: Record<keyof typeof SCORE_WEIGHTS, string> = {
  margin: "贡献毛利率",
  growth: "周销量增速",
  sales: "月销量规模",
  competition: "竞争度（店铺数越少越高）",
  priceBand: "售价与目标价格带匹配",
};

function gradeOf(score: number): CandidateGrade {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  if (score >= 55) return "C";
  return "D";
}

function redFlagsOf(input: CandidateScoreInput): string[] {
  const flags: string[] = [];
  if (input.netProfit <= 0) flags.push("单件贡献毛利不为正，不允许推进测品");
  if (input.netMarginRate < SELECTION_DEFAULTS.killMarginRate) {
    flags.push(`毛利率 ${(input.netMarginRate * 100).toFixed(2)}% 低于淘汰线 ${(SELECTION_DEFAULTS.killMarginRate * 100).toFixed(0)}%`);
  }
  if (input.sellingPrice <= 0) flags.push("售价必须大于 0");
  return flags;
}

export function computeCandidateScore(input: CandidateScoreInput): CandidateScoreDetails {
  const normalized = normalize(input);
  const breakdown: ScoreBreakdownItem[] = (Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>).map((key) => {
    const weight = SCORE_WEIGHTS[key];
    const value = normalized[key];
    return { key, label: LABELS[key], weight, normalized: Number(value.toFixed(4)), contribution: Number((value * weight).toFixed(4)) };
  });
  const total = breakdown.reduce((sum, item) => sum + item.contribution, 0);
  const score = Number((total * 100).toFixed(1));
  return { score, grade: gradeOf(score), breakdown, redFlags: redFlagsOf(input) };
}
