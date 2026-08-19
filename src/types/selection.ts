// 用途：选品调研业务域类型（PRD 故事 13-15）：市场分析 / 选品方向推荐 / 竞品分析的结构化报告卡与工具结果数据。
// 报告不落库（PRD 数据对象无选品报告实体），随对话展示并进入生成审计；卡片字段为模型基于 FastMoss 数据撰写的结论性中文文本。
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
