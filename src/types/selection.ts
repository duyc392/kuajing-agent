// 用途：选品调研业务域类型：
// 一、对话式调研（PRD 故事 13-15）：市场分析 / 选品方向推荐 / 竞品分析的结构化报告卡与工具结果数据。
// 二、选品工作台（智能选品与测品 SPEC v3）：23 列候选品、沙盒草稿、视频透视与推进测品的请求出参类型。
// 报告与候选品都不落库（沙盒存浏览器 localStorage），推进测品才创建正式数据。
import type { ProductDnaInput } from "./product";
import type { ScriptShot } from "./script";

export const MARKET_TOOL_NAME = "analyze_market";
export const RECOMMEND_TOOL_NAME = "recommend_products";
export const COMPETITOR_TOOL_NAME = "analyze_competitor";

// 故事 13 市场分析报告卡：市场容量、竞争度、增长趋势、利润空间 + 关键数据点。
export interface MarketAnalysisDetails {
  market: string;
  category: string;
  capacity: string;
  competition: string;
  growth: string;
  profit: string;
  dataHighlights: string[];
}

// 故事 14 选品方向推荐：每个方向必须有数据支撑与结合店铺定位的理由。
export interface RecommendationItem {
  direction: string;
  dataSupport: string;
  reason: string;
}

export interface RecommendationDetails {
  market: string;
  recommendations: RecommendationItem[];
}

// 故事 15 竞品分析报告卡：定价 / 内容风格 / 上新频率 / 流量结构 + 与自家店铺对比与差异化方向。
export interface CompetitorDetails {
  shopName: string;
  pricing: string;
  contentStyle: string;
  listingFrequency: string;
  trafficStructure: string;
  comparison: string;
  differentiation: string;
}

// 模型组合输出的统一结构：summary 给 Agent 转述与用户阅读，card 给前端结构化卡片。
export interface SelectionComposition<T> {
  summary: string;
  card: T;
}

// ================= 选品工作台（智能选品与测品 SPEC v3 / 原型复刻） =================

export const SELECTION_REGIONS = ["US", "UK", "ID"] as const;
export type SelectionRegion = (typeof SELECTION_REGIONS)[number];

export const SELECTION_WORKBENCH_TOOL_NAME = "update_selection_candidates";

// 筛选策略：目标市场 / 类目 / 售价区间 / 基础过滤与自然语言诉求。
export interface SelectionFilterParams {
  targetRegion: SelectionRegion;
  targetCategory: string;
  priceRange: { min: number; max: number };
  minMarginRate: number;
  maxWeightGrams: number;
  isProhibitedGoodsExcluded: boolean;
  naturalLanguagePrompt?: string;
}

// 财务精算入参（SPEC 第 3 章五要素）：费率与运费由调用方经 config/selection 传入，纯函数本身不读配置。
export interface SelectionFinanceInput {
  region: SelectionRegion;
  sellingPrice: number;
  costRmb: number;
  weightGrams: number;
  // 运费已由外部（config/selection 的 calcShippingFee）确定：美区阶梯公式，英/印模拟运费。
  shippingFee: number;
  fxRate: number;
  platformRate: number;
  commissionRate: number;
  refundRate: number;
}

// 财务精算结果：服务端派生、推进重算与前端表格 0ms 重算的统一计算域契约。
export interface SelectionFinanceResult {
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

// 推进测品时随候选品一起落库的脚本草稿（沿用视频脚本的分镜结构，纯持久化不调模型）。
export interface SelectionScriptDraft {
  type: string;
  duration: number;
  hook: string;
  cta: string;
  style: string | null;
  shots: ScriptShot[];
}

// 23 列候选品：大盘/价格成本/履约物流/扣点税费/营销分佣/利润/投流红线/决策状态；
// 展示列之外附带内部决策数据（DNA、内置脚本与模拟佣金率，供推进测品使用）。
export interface SelectionCandidate {
  candidateId: string;
  isSelected: boolean;
  targetRegion: SelectionRegion;
  name: string;
  emoji: string;
  sellingPoint: string;
  sourceTag: "factory" | "ali";
  category: string;
  monthlySales: number;
  weeklyGrowth: number;
  gmv7d: number;
  videoCount: number;
  creatorCount: number;
  shopCount: number;
  ratingScore: string;
  categoryCr: number;
  sellingPrice: number;
  costRmb: number;
  costEdited: boolean;
  weightGrams: number;
  shippingFee: number;
  shippingSimulated: boolean;
  platformFee: number;
  creatorComm: number;
  refundReserve: number;
  netProfit: number;
  netMarginRate: number;
  maxCpa: number;
  breakevenRoas: number;
  status: "建议测品" | "候选保留" | "已淘汰";
  commissionRate: number;
  dna: ProductDnaInput;
  builtInScripts: SelectionScriptDraft[];
  // 套用分镜后的临时脚本（沙盒内，仅前端持有，推进时传回）。
  customScript?: SelectionDraftScript;
}

// 沙盒草稿：按 shopId 存 localStorage 的 key 为 `selection-scratchpad:${shopId}`，版本不匹配或解析失败安全清空。
export interface SelectionScratchpad {
  version: 1;
  shopId: string;
  filters: SelectionFilterParams;
  candidates: SelectionCandidate[];
  generatedAt: string;
  updatedAt: string;
}

export interface RunSelectionInput {
  shopId: string;
  filters: SelectionFilterParams;
}

export interface RunSelectionResult {
  generatedAt: string;
  candidates: SelectionCandidate[];
  // 候选数量偏少时的确定性提示（筛选条件过严），供前端展示给用户。
  note?: string;
}

// 视频深度透视：4 节点关键帧 + Whisper 原声台词与 8 维客观事实（当前阶段为确定性模拟数据）。
export interface VideoInsightSection {
  phase: "hook" | "intro" | "demo" | "cta";
  timeRange: string;
  keyframeDescription: string;
  englishLine: string;
}

export interface VideoInsightResult {
  durationSeconds: number;
  transcript: string;
  sections: VideoInsightSection[];
  objectiveFacts: string[];
}

export interface VideoInsightInput {
  shopId: string;
  candidateId: string;
  videoUrl: string;
}

// 临时脚本：套用分镜后生成的沙盒脚本，时长严格等于参考视频时长，persisted 恒为 false。
export interface DraftScriptSection {
  orderIndex: number;
  sceneName: string;
  durationSeconds: number;
  visualCue: string;
  spokenText: string;
  screenText?: string;
}

export interface SelectionDraftScript {
  title: string;
  angleType: "pain" | "demo" | "comparison";
  durationSeconds: number;
  sections: DraftScriptSection[];
}

export interface GenerateDraftScriptInput {
  shopId: string;
  candidate: SelectionCandidate;
  videoInsight: VideoInsightResult;
}

export interface GenerateDraftScriptResult {
  script: SelectionDraftScript;
  persisted: false;
}

export interface PromoteSelectionInput {
  shopId: string;
  candidate: SelectionCandidate;
  customDraftScript?: SelectionDraftScript;
}

export interface PromoteSelectionResult {
  productId: string;
  testingStatus: "testing";
  scriptsCreatedCount: number;
}

// Agent 联动协议：Agent 工具返回结构化操作指令，由前端 SelectionContext 执行，Agent 不直接写数据库与 DOM。
export type SelectionUiAction =
  | { type: "KILL_CANDIDATE"; candidateId: string; reason?: string }
  | { type: "RESTORE_CANDIDATE"; candidateId: string }
  | { type: "HIGHLIGHT_LOW_MARGIN"; threshold: number }
  | { type: "UPDATE_CANDIDATE_COST"; candidateId: string; costRmb: number }
  | { type: "SIMULATE_COMMISSION"; commissionRate: number };

export interface SelectionWorkbenchDetails {
  actions: SelectionUiAction[];
}
