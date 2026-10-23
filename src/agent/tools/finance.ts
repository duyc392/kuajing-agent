// 用途：选品量化工具：财务测算与综合打分各自一个工具，全部是确定性公式，不调用模型。
// 计费口径与费率来自 config/selection，价格与成本由调用方传入；模型只负责转述结果。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { computeSelectionFinance } from "@/lib/selection-finance";
import { computeCandidateScore } from "@/lib/product-score";
import { CREATOR_COMMISSION_RATE, PLATFORM_FEE_RATE, REFUND_RESERVE_RATE, USD_TO_RMB } from "@/config/selection";
import type { CandidateScoreDetails, UnitEconomicsDetails } from "@/types";

const economicsSchema = Type.Object({
  sellingPrice: Type.Number({ description: "售价（美元）", exclusiveMinimum: 0, maximum: 100000 }),
  costRmb: Type.Number({ description: "采购成本（人民币，含税）", minimum: 0, maximum: 1000000 }),
  shippingFee: Type.Number({ description: "头程+尾程运费（美元，按件）", minimum: 0, maximum: 10000 }),
  fxRate: Type.Optional(Type.Number({ description: "人民币兑美元汇率，缺省用店铺默认汇率", exclusiveMinimum: 0, maximum: 100 })),
  platformRate: Type.Optional(Type.Number({ description: "平台抽佣比例（0-1 小数），缺省用默认值", minimum: 0, maximum: 1 })),
  commissionRate: Type.Optional(Type.Number({ description: "达人佣金率（0-1 小数），缺省用默认值", minimum: 0, maximum: 1 })),
  refundRate: Type.Optional(Type.Number({ description: "预估退货率（0-1 小数），缺省用默认值", minimum: 0, maximum: 1 })),
});

const scoreSchema = Type.Object({
  monthlySales: Type.Number({ description: "月销量（件）", minimum: 0, maximum: 10000000 }),
  weeklyGrowth: Type.Number({ description: "周销量增速（百分比，如 320 表示 320%）", minimum: -100, maximum: 100000 }),
  shopCount: Type.Number({ description: "在售同款店铺数，反映竞争度", minimum: 0, maximum: 100000 }),
  sellingPrice: Type.Number({ description: "售价（美元）", exclusiveMinimum: 0, maximum: 100000 }),
  netProfit: Type.Number({ description: "单件贡献毛利（美元），由 calc_unit_economics 得出", maximum: 1000000 }),
  netMarginRate: Type.Number({ description: "贡献毛利率（0-1 小数），由 calc_unit_economics 得出", minimum: -1, maximum: 1 }),
  targetPriceMin: Type.Optional(Type.Number({ description: "目标价格带下限（美元），缺省用默认区间", minimum: 0 })),
  targetPriceMax: Type.Optional(Type.Number({ description: "目标价格带上限（美元），缺省用默认区间", minimum: 0 })),
});

type EconomicsParams = Static<typeof economicsSchema>;
type ScoreParams = Static<typeof scoreSchema>;

export function createUnitEconomicsTool(): AgentTool<typeof economicsSchema, UnitEconomicsDetails> {
  return {
    name: "calc_unit_economics",
    label: "单品财务测算",
    description:
      "按固定公式算单件成本、平台抽佣、达人佣金、退货预留、贡献毛利、毛利率、保本 Max CPA 与保本 ROAS。卖家问能不能赚钱、毛利多少、保本 ROAS 多少时必须调用本工具，禁止自己心算。",
    parameters: economicsSchema,
    async execute(_toolCallId, params: EconomicsParams): Promise<AgentToolResult<UnitEconomicsDetails>> {
      const result = computeSelectionFinance({
        region: "US",
        sellingPrice: params.sellingPrice,
        costRmb: params.costRmb,
        weightGrams: 0,
        shippingFee: params.shippingFee,
        fxRate: params.fxRate ?? USD_TO_RMB,
        platformRate: params.platformRate ?? PLATFORM_FEE_RATE,
        commissionRate: params.commissionRate ?? CREATOR_COMMISSION_RATE,
        refundRate: params.refundRate ?? REFUND_RESERVE_RATE,
      });
      const text = [
        `单件测算：成本 ${result.costTarget} + 运费 ${result.shippingFee} + 平台佣金 ${result.platformFee} + 达人佣金 ${result.creatorComm} + 退货预留 ${result.refundReserve} = 总成本 ${result.totalCost} 美元；`,
        `贡献毛利 ${result.netProfit} 美元，毛利率 ${(result.netMarginRate * 100).toFixed(2)}%，保本 ROAS ${result.breakevenRoas}。`,
        result.netProfit <= 0 ? "注意：贡献毛利不为正，这组参数下不该推进。" : "转述时请保留两位小数，不要重新计算。",
      ].join("");
      return { content: [{ type: "text", text }], details: { sellingPrice: params.sellingPrice, ...result } };
    },
  };
}

export function createScoreCandidateTool(): AgentTool<typeof scoreSchema, CandidateScoreDetails> {
  return {
    name: "score_candidate",
    label: "候选品打分",
    description:
      "按固定权重给候选品打 0-100 分（毛利 35%、增速 25%、销量 20%、竞争度 10%、价格带 10%），输出等级、逐项拆解与红线原因。卖家要比较几个品、要求推荐优先级、问哪个值得做时必须调用，禁止自己估分。",
    parameters: scoreSchema,
    async execute(_toolCallId, params: ScoreParams): Promise<AgentToolResult<CandidateScoreDetails>> {
      const targetPrice = params.targetPriceMin !== undefined && params.targetPriceMax !== undefined
        ? { min: params.targetPriceMin, max: params.targetPriceMax }
        : undefined;
      const details = computeCandidateScore({
        monthlySales: params.monthlySales,
        weeklyGrowth: params.weeklyGrowth,
        shopCount: params.shopCount,
        sellingPrice: params.sellingPrice,
        netProfit: params.netProfit,
        netMarginRate: params.netMarginRate,
        targetPrice,
      });
      const lines = details.breakdown.map((item) => `${item.label} ${(item.normalized * 100).toFixed(0)} 分（权重 ${item.weight}）`);
      const text = [
        `综合得分 ${details.score}（${details.grade} 级）。`,
        `拆解：${lines.join("；")}。`,
        details.redFlags.length > 0 ? `红线：${details.redFlags.join("；")}。` : "未触发红线。",
      ].join("");
      return { content: [{ type: "text", text }], details };
    },
  };
}
