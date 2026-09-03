// 用途：选品工作台 API 入参校验（zod）：候选品完整 23 列契约、视频透视与定制脚本校验，两个路由共用；
// schema 覆盖服务层真正使用的全部字段（含内部决策字段），z.infer 即契约类型，无需强制转换；未知字段经 passthrough 透传（如 customScript）。
import { z } from "zod";

const scriptShotSchema = z.object({
  scene: z.string().min(1, "分镜画面不能为空").max(500),
  voiceover: z.string().min(1, "分镜口播不能为空").max(1000),
  subtitle: z.string().min(1, "分镜字幕不能为空").max(1000),
  seconds: z.number().int().min(1).max(600),
});

const builtInScriptSchema = z.object({
  type: z.string().min(1).max(50),
  duration: z.number().int().min(1).max(600),
  hook: z.string().min(1).max(500),
  cta: z.string().min(1).max(500),
  style: z.string().max(500).nullable(),
  shots: z.array(scriptShotSchema).min(1).max(50),
});

export const dnaSchema = z.object({
  targetPersona: z.string().min(1, "核心用户画像不能为空").max(500),
  useScenarios: z.string().min(1, "核心使用场景不能为空").max(500),
  coreSellingPoints: z.string().min(1, "核心卖点不能为空").max(500),
  visualHooks: z.string().min(1, "视觉冲击效果不能为空").max(500),
  recommendedFormats: z.string().min(1, "推荐视频呈现方式不能为空").max(500),
  competitorDifferences: z.string().min(1, "竞品差异不能为空").max(500),
});

export const customDraftScriptSchema = z.object({
  title: z.string().max(300),
  angleType: z.enum(["pain", "demo", "comparison"]),
  durationSeconds: z.number().int().min(1).max(600),
  sections: z
    .array(
      z.object({
        orderIndex: z.number().int().min(1),
        sceneName: z.string().max(300),
        durationSeconds: z.number().int().min(1).max(600),
        visualCue: z.string().min(1, "画面线索不能为空").max(500),
        spokenText: z.string().min(1, "口播不能为空").max(1000),
        screenText: z.string().max(1000).optional(),
      }),
    )
    .min(1, "分镜不能为空")
    .max(50, "分镜过多"),
});

// 候选品完整契约：23 列 + 内部决策字段（与 SelectionCandidate 完全一致，z.infer 即契约类型）。
export const selectionCandidateSchema = z
  .object({
    candidateId: z.string().min(1, "候选品 ID 不能为空").max(200, "候选品 ID 过长"),
    isSelected: z.boolean(),
    targetRegion: z.enum(["US", "UK", "ID"]),
    name: z.string().min(1, "商品名称不能为空").max(300, "商品名称过长"),
    emoji: z.string().max(16),
    sellingPoint: z.string().max(300, "卖点描述过长"),
    sourceTag: z.enum(["factory", "ali"]),
    category: z.string().max(100, "类目过长"),
    monthlySales: z.number().min(0),
    weeklyGrowth: z.number(),
    gmv7d: z.number().min(0),
    videoCount: z.number().min(0),
    creatorCount: z.number().min(0),
    shopCount: z.number().min(0),
    ratingScore: z.string().max(50),
    categoryCr: z.number().min(0),
    sellingPrice: z.number().min(0.01, "售价必须大于 0").max(100000, "售价过大"),
    costRmb: z.number().min(0, "采购成本不能为负").max(100000, "采购成本过大"),
    costEdited: z.boolean(),
    weightGrams: z.number().min(1, "重量至少 1 克").max(100000, "重量过大"),
    shippingFee: z.number().min(0),
    shippingSimulated: z.boolean(),
    platformFee: z.number().min(0),
    creatorComm: z.number().min(0),
    refundReserve: z.number().min(0),
    netProfit: z.number(),
    netMarginRate: z.number().min(-100, "毛利率异常过低").max(1),
    maxCpa: z.number(),
    breakevenRoas: z.number().min(0),
    status: z.enum(["建议测品", "候选保留", "已淘汰"]),
    commissionRate: z.number().min(0).max(1),
    dna: dnaSchema,
    builtInScripts: z.array(builtInScriptSchema).min(1, "内置脚本不能为空").max(5, "内置脚本过多"),
    customScript: customDraftScriptSchema.optional(),
  })
  .passthrough();

// 沙盒草稿全量校验（localStorage 容错）：版本与结构完整才允许恢复，任何候选非法即整体重置。
export const scratchpadSchema = z
  .object({
    version: z.literal(1),
    shopId: z.string().min(1),
    filters: z.object({
      targetRegion: z.enum(["US", "UK", "ID"]),
      targetCategory: z.string().min(1).max(50),
      priceRange: z.object({ min: z.number().min(0.01), max: z.number().min(0.01) }),
      minMarginRate: z.number().min(0).max(1),
      maxWeightGrams: z.number().int().min(1),
      isProhibitedGoodsExcluded: z.boolean(),
      naturalLanguagePrompt: z.string().max(2000).optional(),
    }),
    candidates: z.array(selectionCandidateSchema).max(100),
    generatedAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .passthrough();

export const videoInsightResultSchema = z.object({
  durationSeconds: z.number().int().min(1).max(600),
  transcript: z.string().max(10000),
  sections: z.array(
    z.object({
      phase: z.enum(["hook", "intro", "demo", "cta"]),
      timeRange: z.string().max(30),
      keyframeDescription: z.string().max(500),
      englishLine: z.string().max(1000),
    }),
  ),
  objectiveFacts: z.array(z.string().max(500)),
});
