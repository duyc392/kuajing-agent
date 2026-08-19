// 用途：选品调研工具（PRD 故事 13-15）：市场分析 / 选品方向推荐 / 竞品分析，数据经 FastMoss MCP 实时获取，
// 结果由模型组合为「要点总结 + 结构化报告卡」；参数 schema 用 TypeBox（pi-agent-core 的 AgentTool.parameters 契约要求 TSchema）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { runCompetitorAnalysis, runMarketAnalysis, runProductRecommendation } from "@/agent/selection-flow";
import type { CompetitorDetails, GenerateTextFn, MarketAnalysisDetails, RecommendationDetails } from "@/types";

interface SelectionToolDeps {
  shopId: string;
  generateText: GenerateTextFn;
}

const marketSchema = Type.Object({
  keywords: Type.Array(
    Type.String({ description: "品类关键词原文", minLength: 1, maxLength: 100, pattern: "\\S" }),
    {
      description: "品类关键词列表，用卖家原话，不要翻译",
      minItems: 1,
      maxItems: 5,
    },
  ),
  market: Type.String({ description: "目标市场，按店铺市场选择，如：美国 / 英国 / 东南亚-印尼 / 东南亚-泰国", minLength: 1, maxLength: 50, pattern: "\\S" }),
});

const competitorSchema = Type.Object({
  shopKeyword: Type.String({ description: "竞品店铺名称或关键词，用卖家原话", minLength: 1, maxLength: 200, pattern: "\\S" }),
  market: Type.String({ description: "目标市场，按店铺市场选择，如：美国 / 英国 / 东南亚-印尼", minLength: 1, maxLength: 50, pattern: "\\S" }),
});

type MarketParams = Static<typeof marketSchema>;
type CompetitorParams = Static<typeof competitorSchema>;

// 执行前统一 trim：清理后为空的关键词/市场/店铺名直接拒绝（防止"   "绕过长度校验进入查询）。
function cleanMarketParams(params: MarketParams): MarketParams {
  const keywords = params.keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "");
  const market = params.market.trim();
  if (keywords.length === 0 || market === "") {
    throw new Error("品类关键词与目标市场不能为空");
  }
  return { keywords, market };
}

function cleanCompetitorParams(params: CompetitorParams): CompetitorParams {
  const shopKeyword = params.shopKeyword.trim();
  const market = params.market.trim();
  if (shopKeyword === "" || market === "") {
    throw new Error("竞品店铺名称与目标市场不能为空");
  }
  return { shopKeyword, market };
}

export function createMarketTool(deps: SelectionToolDeps): AgentTool<typeof marketSchema, MarketAnalysisDetails> {
  return {
    name: "analyze_market",
    label: "市场分析",
    description:
      "分析某品类在目标市场的选品机会，输出市场容量、竞争度、增长趋势、利润空间四维度的结构化报告（数据来自 FastMoss，实时查询不落库）。卖家要求市场分析、品类机会分析、选品调研时必须调用本工具；keywords 填卖家说的品类关键词；market 按店铺市场选择。",
    parameters: marketSchema,
    async execute(_toolCallId, params: MarketParams, signal?: AbortSignal): Promise<AgentToolResult<MarketAnalysisDetails>> {
      const clean = cleanMarketParams(params);
      const { summary, card } = await runMarketAnalysis({
        keywords: clean.keywords,
        market: clean.market,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      return { content: [{ type: "text", text: summary }], details: card };
    },
  };
}

export function createRecommendTool(deps: SelectionToolDeps): AgentTool<typeof marketSchema, RecommendationDetails> {
  return {
    name: "recommend_products",
    label: "选品方向推荐",
    description:
      "基于 FastMoss 品类榜单与热销商品数据，结合卖家店铺定位，推荐 2-3 个选品方向（每个方向含数据支撑与理由）。卖家要求选品方向推荐、推荐可做的品类或跟卖方向时必须调用本工具；keywords 填品类关键词；market 按店铺市场选择。",
    parameters: marketSchema,
    async execute(_toolCallId, params: MarketParams, signal?: AbortSignal): Promise<AgentToolResult<RecommendationDetails>> {
      const clean = cleanMarketParams(params);
      const { summary, card } = await runProductRecommendation({
        keywords: clean.keywords,
        market: clean.market,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      return { content: [{ type: "text", text: summary }], details: card };
    },
  };
}

export function createCompetitorTool(deps: SelectionToolDeps): AgentTool<typeof competitorSchema, CompetitorDetails> {
  return {
    name: "analyze_competitor",
    label: "竞品分析",
    description:
      "拆解竞品店铺的运营策略：定价策略、内容风格、上新频率、流量结构，并输出「与你的店铺对比」和「建议的差异化方向」（数据来自 FastMoss）。卖家要求分析竞品、拆解同行店铺时必须调用本工具；shopKeyword 填卖家给的店铺名称或关键词；market 按店铺市场选择。",
    parameters: competitorSchema,
    async execute(_toolCallId, params: CompetitorParams, signal?: AbortSignal): Promise<AgentToolResult<CompetitorDetails>> {
      const clean = cleanCompetitorParams(params);
      const { summary, card } = await runCompetitorAnalysis({
        shopKeyword: clean.shopKeyword,
        market: clean.market,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      return { content: [{ type: "text", text: summary }], details: card };
    },
  };
}
