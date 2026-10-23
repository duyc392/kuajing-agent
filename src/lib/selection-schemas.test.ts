// 用途：选品入参 schema 单测：DNA 必填、候选价格/重量边界、草稿版本与分镜结构校验。
import test from "node:test";
import assert from "node:assert/strict";
import {
  customDraftScriptSchema,
  dnaSchema,
  scratchpadSchema,
  selectionCandidateSchema,
} from "@/lib/selection-schemas";

const DNA = {
  targetPersona: "通勤女性",
  useScenarios: "车内充电",
  coreSellingPoints: "一拉即收",
  visualHooks: "拉线回弹",
  recommendedFormats: "对比 + 演示",
  competitorDifferences: "三合一接口",
};

const CANDIDATE = {
  candidateId: "c-1",
  isSelected: false,
  targetRegion: "US",
  name: "自动卷线充电器",
  emoji: "",
  sellingPoint: "一拉即收",
  sourceTag: "factory",
  category: "3C数码",
  monthlySales: 1000,
  weeklyGrowth: 20,
  gmv7d: 20000,
  videoCount: 30,
  creatorCount: 10,
  shopCount: 5,
  ratingScore: "4.8",
  categoryCr: 0.1,
  sellingPrice: 24.99,
  costRmb: 15,
  costEdited: false,
  weightGrams: 180,
  shippingFee: 3.5,
  shippingSimulated: false,
  platformFee: 1.25,
  creatorComm: 3.75,
  refundReserve: 0.75,
  netProfit: 5.5,
  netMarginRate: 0.22,
  maxCpa: 5.5,
  breakevenRoas: 4.54,
  status: "建议测品",
  commissionRate: 0.15,
  dna: DNA,
  builtInScripts: [
    {
      type: "种草",
      duration: 10,
      hook: "还在为线材打结烦恼？",
      cta: "点击下方小黄车",
      style: null,
      shots: [{ scene: "车内中控", voiceover: "一拉即收", subtitle: "一拉即收", seconds: 5 }],
    },
  ],
};

test("dnaSchema：六项必填", () => {
  assert.equal(dnaSchema.safeParse(DNA).success, true);
  assert.equal(dnaSchema.safeParse({ ...DNA, coreSellingPoints: "" }).success, false);
});

test("selectionCandidateSchema：合法候选通过", () => {
  assert.equal(selectionCandidateSchema.safeParse(CANDIDATE).success, true);
});

test("selectionCandidateSchema：售价/重量/毛利边界拒绝", () => {
  assert.equal(selectionCandidateSchema.safeParse({ ...CANDIDATE, sellingPrice: 0 }).success, false);
  assert.equal(selectionCandidateSchema.safeParse({ ...CANDIDATE, weightGrams: 0 }).success, false);
  assert.equal(selectionCandidateSchema.safeParse({ ...CANDIDATE, netMarginRate: 1.2 }).success, false);
});

test("scratchpadSchema：版本必须为 1", () => {
  const base = {
    version: 1,
    shopId: "s-1",
    filters: {
      targetRegion: "US",
      targetCategory: "3C数码",
      priceRange: { min: 10, max: 50 },
      minMarginRate: 0.3,
      maxWeightGrams: 500,
      isProhibitedGoodsExcluded: true,
    },
    candidates: [CANDIDATE],
    generatedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(scratchpadSchema.safeParse(base).success, true);
  assert.equal(scratchpadSchema.safeParse({ ...base, version: 2 }).success, false);
});

test("customDraftScriptSchema：分镜不能为空", () => {
  const script = { title: "20 秒种草", angleType: "pain", durationSeconds: 20, sections: [] };
  assert.equal(customDraftScriptSchema.safeParse(script).success, false);
  assert.equal(
    customDraftScriptSchema.safeParse({
      ...script,
      sections: [{ orderIndex: 1, sceneName: "镜头 1", durationSeconds: 20, visualCue: "画面", spokenText: "口播" }],
    }).success,
    true,
  );
});
