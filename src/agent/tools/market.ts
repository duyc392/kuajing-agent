// 用途：三方大盘数据工具：只取数、只返回原始结构化数据，不做任何结论。
// 结论由主 Agent 按「选品/竞品」SOP 组织；工具层禁止调用模型（这是 Tool/Skill 分层的核心约束）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { fetchCompetitorShop, fetchMarketDataset } from "@/services/market-data.service";
import type { CompetitorShopDetails, MarketDatasetDetails } from "@/types";

const marketSchema = Type.Object({
  keywords: Type.Array(
    Type.String({ description: "品类关键词原文", minLength: 1, maxLength: 100, pattern: "\\S" }),
    { description: "品类关键词列表，用卖家原话，不要翻译", minItems: 1, maxItems: 5 },
  ),
  market: Type.String({ description: "目标市场，按店铺市场填写，如：美国 / 英国 / 东南亚-印尼", minLength: 1, maxLength: 50, pattern: "\\S" }),
  period: Type.Optional(
    Type.Union([Type.Literal("week"), Type.Literal("month")], { description: "统计周期：week=上周，month=上月（默认 week）" }),
  ),
  topN: Type.Optional(Type.Integer({ description: "热销商品榜返回条数，默认 10，上限 50", minimum: 1, maximum: 50 })),
});

const competitorShopSchema = Type.Object({
  shopKeyword: Type.String({ description: "竞品店铺名称或关键词，用卖家原话", minLength: 1, maxLength: 200, pattern: "\\S" }),
  market: Type.String({ description: "目标市场，按店铺市场填写", minLength: 1, maxLength: 50, pattern: "\\S" }),
});

type MarketParams = Static<typeof marketSchema>;
type CompetitorShopParams = Static<typeof competitorShopSchema>;

function cleanMarketParams(params: MarketParams): MarketParams {
  const keywords = params.keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "");
  const market = params.market.trim();
  if (keywords.length === 0 || market === "") throw new Error("品类关键词与目标市场不能为空");
  return { ...params, keywords, market };
}

export function createFetchMarketDataTool(): AgentTool<typeof marketSchema, MarketDatasetDetails> {
  return {
    name: "fetch_market_data",
    label: "拉取大盘数据",
    description:
      "拉取某品类在目标市场的大盘原始数据：品类榜单、市场容量指标、价格带分布、热销商品榜（数据来自 FastMoss）。只返回数据，不做结论。卖家要求做市场分析、选品推荐、品类调研时先调本工具取数，再按对应 SOP 自己解读；keywords 填卖家原话，market 按店铺市场填。查询有 30 秒上限。",
    parameters: marketSchema,
    async execute(_toolCallId, params: MarketParams, signal?: AbortSignal): Promise<AgentToolResult<MarketDatasetDetails>> {
      const clean = cleanMarketParams(params);
      const details = await fetchMarketDataset({
        keywords: clean.keywords,
        market: clean.market,
        period: clean.period ?? "week",
        topN: clean.topN ?? 10,
        signal,
      });
      const text = [
        `已取到数据（${details.market} · ${details.category.name} · ${details.periodValue}）：`,
        `- 查询口径：${details.granularityNote}`,
        "- 已返回：品类榜单 ranking、市场指标 metrics、价格带 priceDistribution、热销商品 topProducts",
        "请按 SOP 解读这些数据，引用数字时注明周期与口径；没有的指标标注「未提供」，不要推算。",
      ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}

export function createCompetitorShopTool(): AgentTool<typeof competitorShopSchema, CompetitorShopDetails> {
  return {
    name: "fetch_competitor_shop",
    label: "拉取竞品店铺数据",
    description:
      "拉取竞品店铺的原始数据：商品结构、销售渠道、视频数据（数据来自 FastMoss）。只返回数据，不做结论。卖家要拆解竞品店铺、分析同行打法时先调本工具，再按竞品 SOP 自己归纳定价/内容/流量打法。",
    parameters: competitorShopSchema,
    async execute(_toolCallId, params: CompetitorShopParams, signal?: AbortSignal): Promise<AgentToolResult<CompetitorShopDetails>> {
      const details = await fetchCompetitorShop({ shopKeyword: params.shopKeyword.trim(), market: params.market.trim(), signal });
      const text = [
        `已取到竞品店铺「${details.shopName}」的数据（${details.market}，近 28 天）：`,
        "- 已返回：商品结构 products、销售数据 sales、视频数据 videos",
        "请据实归纳打法，引用数字时注明时间范围；数据里没有的结论不要编。",
      ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}
