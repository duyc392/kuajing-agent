// 用途：手动候选品纯构造函数（浏览器沙盒与服务层共用的唯一实现，避免两处业务规则漂移）：
// 输入基础表单信息与目标市场，产出候选（占位 DNA 与通用内置脚本，财务列由调用方 recalc 或纯函数补全）。
// 价格契约：计算域一律为美元（cf. config/selection；推进入库时按 USD_TO_RMB 折人民币）。
import type { SelectionCandidate, SelectionRegion } from "@/types";
import { CREATOR_COMMISSION_RATE } from "@/config/selection";

// 手动候选品的通用内置脚本（3 篇最小分镜）：真实内容由推进后在「内容创作工坊」完善。
const GENERIC_SHOTS = [
  { scene: "商品与目标场景开场展示", voiceover: "Meet your new everyday helper.", subtitle: "Meet your new everyday helper.", seconds: 3 },
  { scene: "演示核心卖点动作", voiceover: "Everything you need, one tap away.", subtitle: "Everything you need, one tap away.", seconds: 8 },
  { scene: "成品效果特写", voiceover: "See the difference in seconds.", subtitle: "See the difference in seconds.", seconds: 6 },
  { scene: "指向小黄车促单", voiceover: "Tap below to grab yours today.", subtitle: "Tap below to grab yours today.", seconds: 3 },
];

function genericScripts(): SelectionCandidate["builtInScripts"] {
  return (["种草", "教程", "开箱"] as const).map((type) => ({
    type,
    duration: 20,
    hook: GENERIC_SHOTS[0].voiceover,
    cta: GENERIC_SHOTS[3].voiceover,
    style: null,
    shots: GENERIC_SHOTS.map((shot) => ({ ...shot })),
  }));
}

export function buildManualCandidate(
  input: { name: string; category: string; sellingPrice: number; costRmb: number; weightGrams: number },
  region: SelectionRegion,
): SelectionCandidate {
  return {
    candidateId: `manual-${crypto.randomUUID()}`,
    isSelected: false,
    targetRegion: region,
    name: input.name,
    emoji: "📦",
    sellingPoint: "手动添加",
    sourceTag: "ali",
    category: input.category,
    monthlySales: 0,
    weeklyGrowth: 0,
    gmv7d: 0,
    videoCount: 0,
    creatorCount: 0,
    shopCount: 0,
    ratingScore: "—",
    categoryCr: 0,
    sellingPrice: input.sellingPrice,
    costRmb: input.costRmb,
    costEdited: true,
    weightGrams: input.weightGrams,
    shippingFee: 0,
    shippingSimulated: region !== "US",
    platformFee: 0,
    creatorComm: 0,
    refundReserve: 0,
    netProfit: 0,
    netMarginRate: 0,
    maxCpa: 0,
    breakevenRoas: 999,
    status: "候选保留",
    commissionRate: CREATOR_COMMISSION_RATE,
    dna: {
      targetPersona: "待补充",
      useScenarios: "待补充",
      coreSellingPoints: "手动添加商品，待完善商品档案",
      visualHooks: "待补充",
      recommendedFormats: "待补充",
      competitorDifferences: "待补充",
    },
    builtInScripts: genericScripts(),
  };
}
