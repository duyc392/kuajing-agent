// 用途：选品量化域类型：单品财务测算（成本/费用/毛利/保本 ROAS）与候选品综合打分。
// 两个工具分别只做一件事：calc_unit_economics 只算钱，score_candidate 只按固定权重打分；模型不得自行做任何算术。

export const CALC_UNIT_ECONOMICS_TOOL_NAME = "calc_unit_economics";
export const SCORE_CANDIDATE_TOOL_NAME = "score_candidate";

export interface UnitEconomicsParams {
  sellingPrice: number;
  costRmb: number;
  fxRate: number;
  shippingFee: number;
  platformRate: number;
  commissionRate: number;
  refundRate: number;
}

export interface UnitEconomicsDetails {
  sellingPrice: number;
  costTarget: number;
  shippingFee: number;
  platformFee: number;
  creatorComm: number;
  refundReserve: number;
  totalCost: number;
  netProfit: number;
  netMarginRate: number;
  maxCpa: number;
  breakevenRoas: number;
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  weight: number;
  /** 归一化后的得分（0-1） */
  normalized: number;
  contribution: number;
}

export type CandidateGrade = "S" | "A" | "B" | "C" | "D";

export interface CandidateScoreDetails {
  score: number;
  grade: CandidateGrade;
  breakdown: ScoreBreakdownItem[];
  /** 命中任一红线时给出原因（负毛利、毛利率低于淘汰线等） */
  redFlags: string[];
}
