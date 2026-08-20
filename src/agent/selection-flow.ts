// 用途：选品调研编排（Agent 层，方向 agent → services/lib）：解析品类 → 调 FastMoss MCP 取数 →
// 模型解读并组合「结构化报告卡」（PRD 故事 13-15）。报告不落库，随对话展示；模型调用记录生成审计。
// 摘要由代码从校验通过的卡片派生（单一数据源）；整个流程受 30 秒总截止时间约束。
import { AppError, ValidationError } from "@/lib/errors";
import { marketToRegion } from "@/lib/markets";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { callWithGenerationAudit } from "@/agent/generate";
import { createFastmossClient, readFastmossSettings, type FastmossMCPClient } from "@/agent/mcp/fastmoss";
import {
  buildCompetitorSystemPrompt,
  buildCompetitorUserPrompt,
  buildMarketReportSystemPrompt,
  buildMarketReportUserPrompt,
  buildRecommendSystemPrompt,
  buildRecommendUserPrompt,
  type SelectionShopContext,
} from "@/agent/prompts/selection";
import { getShop } from "@/services/shops.service";
import { listMemories } from "@/services/memory.service";
import type {
  CompetitorDetails,
  GenerateTextFn,
  MarketAnalysisDetails,
  RecommendationDetails,
  SelectionComposition,
} from "@/types";

export interface SelectionFlowParams {
  keywords?: string[];
  market: string;
  shopKeyword?: string;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
}

interface ResolvedCategory {
  level1: number;
  level2: number | null;
  name: string;
  level1Name: string;
}

const SELECTION_DEADLINE_MS = 30_000;

// 市场中文名 → FastMoss 地域码；不支持的市场直接给中文错误。
function regionOf(market: string): string {
  const region = marketToRegion(market);
  if (!region) throw new ValidationError("该市场暂不支持 FastMoss 选品数据查询");
  return region;
}

// FastMoss 配置统一经 lib/fastmoss-client 的 readFastmossSettings 读取（与数据看板共用，未配置 Key 时中文引导）。

// 流程级 30 秒截止信号（PRD 性能约束：选品报告 < 30 秒）：所有 MCP 调用与报告组合共用剩余时间。
function createDeadlineSignal(signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("selection deadline")), SELECTION_DEADLINE_MS);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

// 上周 ISO 周值（YYYY-ww）：FastMoss 周期参数只接受已完结周期，ISO 周不涉及时区歧义；周号补足两位。
function lastIsoWeekValue(now: Date): string {
  const firstThursday = (year: number) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    return new Date(Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  };
  const thursdayOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + (3 - ((date.getUTCDay() + 6) % 7))));
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  const thursday = thursdayOf(target);
  const week = 1 + Math.round((thursday.getTime() - firstThursday(thursday.getUTCFullYear()).getTime()) / (7 * 86400000));
  return `${thursday.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

// 上个月值（YYYY-MM）：FastMoss 月度周期参数。
function lastMonthValue(now: Date): string {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 关键词 → 品类 ID：取最高分匹配的品类（含一级/二级 ID、一级类目名与中文全路径名）。
async function resolveCategory(client: FastmossMCPClient, keywords: string[], signal?: AbortSignal): Promise<ResolvedCategory> {
  const data = await client.callTool("search_category_by_words", { query: keywords, top_k: 5, max_total_results: 15 }, signal);
  const raw = (data as { categories?: unknown }).categories;
  const categories = Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
  const first = categories[0];
  if (!first || typeof first.category_id_level1 !== "number") {
    throw new AppError("FastMoss 未找到匹配的品类，请换个关键词重试", "FASTMOSS_CATEGORY", 404);
  }
  const name = typeof first.cn_full_name === "string" && first.cn_full_name.trim() !== "" ? first.cn_full_name : (keywords[0] ?? "未命名品类");
  // cn_full_name 形如"一级-二级-三级"：一级类目名用于诚实标注查询粒度。
  const level1Name = name.split("-")[0] ?? name;
  return {
    level1: first.category_id_level1,
    level2: typeof first.category_id_level2 === "number" ? first.category_id_level2 : null,
    name,
    level1Name,
  };
}

// 查询粒度说明：指标实际按一级类目统计，关键词匹配到的细分方向单独标注，防止报告夸大数据口径。
function granularityOf(category: ResolvedCategory): string {
  return `指标均基于一级类目「${category.level1Name}」统计；卖家关键词匹配到的细分方向为「${category.name}」，报告中必须注明这一粒度差异。`;
}

// 报告组合的店铺上下文（当前店铺信息 + 长期记忆，注入时统一转义）。
async function buildShopContext(shopId: string): Promise<SelectionShopContext> {
  const shop = await getShop(shopId);
  const memories = (await listMemories(shopId)).slice(-MAX_CONTEXT_MEMORIES);
  return { name: shop.name, market: shop.market, description: shop.description, memories };
}

// 模型组合报告卡（带审计与格式重试）：parse 抛错视为格式不合格，重试后仍失败才报业务错误。
async function composeCard<T>(params: {
  flow: SelectionFlowParams;
  systemPrompt: string;
  userPrompt: string;
  parse: (text: string) => T;
}): Promise<T> {
  let extra = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = params.userPrompt + (extra === "" ? "" : `\n${extra}`);
    const text = await callWithGenerationAudit({
      shopId: params.flow.shopId,
      type: "selection",
      modelId: params.flow.generateText.modelId ?? "unknown",
      prompt,
      call: () => params.flow.generateText(params.systemPrompt, prompt, params.flow.signal),
    });
    try {
      return params.parse(text);
    } catch {
      extra = "注意：上一版输出不符合要求，请严格按要求的 JSON 格式重新输出。";
    }
  }
  throw new AppError("选品报告生成失败，请重试", "SELECTION_REPORT_ERROR", 502);
}

// 从模型输出中提取 JSON 对象（容忍代码块围栏与前后杂文）。
function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AppError(`${label}输出格式错误，请重试`, "SELECTION_PARSE_ERROR", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError(`${label}输出格式错误，请重试`, "SELECTION_PARSE_ERROR", 502);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError(`${label}输出格式错误，请重试`, "SELECTION_PARSE_ERROR", 502);
  }
  return parsed as Record<string, unknown>;
}

function cardObject(obj: Record<string, unknown>): Record<string, unknown> {
  const card = obj.card;
  return typeof card === "object" && card !== null && !Array.isArray(card) ? (card as Record<string, unknown>) : {};
}

function cardString(card: Record<string, unknown>, key: string): string {
  const value = card[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseMarketCard(text: string, market: string): MarketAnalysisDetails {
  const card = cardObject(parseJsonObject(text, "市场分析报告"));
  const category = cardString(card, "category");
  const capacity = cardString(card, "capacity");
  const competition = cardString(card, "competition");
  const growth = cardString(card, "growth");
  const profit = cardString(card, "profit");
  if (category === "" || capacity === "" || competition === "" || growth === "" || profit === "") {
    throw new AppError("市场分析报告字段不完整，请重试", "SELECTION_PARSE_ERROR", 502);
  }
  const dataHighlights = Array.isArray(card.dataHighlights)
    ? card.dataHighlights.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 6)
    : [];
  return { market, category, capacity, competition, growth, profit, dataHighlights };
}

function parseRecommendationCard(text: string, market: string): RecommendationDetails {
  const card = cardObject(parseJsonObject(text, "选品推荐报告"));
  const raw = Array.isArray(card.recommendations) ? card.recommendations : [];
  const recommendations = raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({ direction: cardString(item, "direction"), dataSupport: cardString(item, "dataSupport"), reason: cardString(item, "reason") }))
    .filter((item) => item.direction !== "" && item.dataSupport !== "" && item.reason !== "")
    .slice(0, 3);
  if (recommendations.length === 0) {
    throw new AppError("选品推荐报告字段不完整，请重试", "SELECTION_PARSE_ERROR", 502);
  }
  return { market, recommendations };
}

function parseCompetitorCard(text: string): CompetitorDetails {
  const card = cardObject(parseJsonObject(text, "竞品分析报告"));
  const fields = ["shopName", "pricing", "contentStyle", "listingFrequency", "trafficStructure", "comparison", "differentiation"] as const;
  const values = Object.fromEntries(fields.map((key) => [key, cardString(card, key)])) as Record<(typeof fields)[number], string>;
  if (fields.some((key) => values[key] === "")) {
    throw new AppError("竞品分析报告字段不完整，请重试", "SELECTION_PARSE_ERROR", 502);
  }
  return {
    shopName: values.shopName,
    pricing: values.pricing,
    contentStyle: values.contentStyle,
    listingFrequency: values.listingFrequency,
    trafficStructure: values.trafficStructure,
    comparison: values.comparison,
    differentiation: values.differentiation,
  };
}

// 摘要由校验通过的卡片派生（单一数据源），模型不再生成摘要，杜绝摘要与卡片不一致。
function marketSummary(card: MarketAnalysisDetails): string {
  return [
    `市场分析完成（${card.market} · ${card.category}）：`,
    `- 市场容量：${card.capacity}`,
    `- 竞争度：${card.competition}`,
    `- 增长趋势：${card.growth}`,
    `- 利润空间：${card.profit}`,
    card.dataHighlights.length > 0 ? `- 关键数据：${card.dataHighlights.join("；")}` : "",
  ].filter((line) => line !== "").join("\n");
}

function recommendationSummary(card: RecommendationDetails): string {
  const lines = card.recommendations.map((item, index) =>
    `方向 ${index + 1}：${item.direction}（数据支撑：${item.dataSupport}；推荐理由：${item.reason}）`);
  return [`选品方向推荐完成（${card.market}）：`, ...lines].join("\n");
}

function competitorSummary(card: CompetitorDetails): string {
  return [
    `竞品分析完成（${card.shopName}）：`,
    `- 定价策略：${card.pricing}`,
    `- 内容风格：${card.contentStyle}`,
    `- 上新频率：${card.listingFrequency}`,
    `- 流量结构：${card.trafficStructure}`,
    `- 与你的店铺对比：${card.comparison}`,
    `- 差异化建议：${card.differentiation}`,
  ].join("\n");
}

// 故事 13 市场分析：品类解析 → 二级品类榜单（竞争度/增速）→ 品类基础指标（容量）→ 价格带（利润空间）→ 模型组合报告卡。
export async function runMarketAnalysis(params: SelectionFlowParams): Promise<SelectionComposition<MarketAnalysisDetails>> {
  const region = regionOf(params.market);
  const deadline = createDeadlineSignal(params.signal);
  const client = await createFastmossClient(await readFastmossSettings("选品功能"));
  try {
    const category = await resolveCategory(client, params.keywords ?? [], deadline.signal);
    const now = new Date();
    const ranking = await client.callTool("market_category_ranking", {
      filter: { category_id: category.level1, date_type: "week", date_value: lastIsoWeekValue(now), region },
      lang: "ZH_CN",
      orderby: [{ field: "category_units_sold", order: "desc" }],
    }, deadline.signal);
    const monthFilter = { category_id: category.level1, date_type: "month", date_value: lastMonthValue(now), region };
    const metrics = await client.callTool("market_category_analysis", { filter: monthFilter, analysis_type: "basic_metrics" }, deadline.signal);
    const prices = await client.callTool("market_category_analysis", { filter: monthFilter, analysis_type: "price_distribution" }, deadline.signal);
    const shopContext = await buildShopContext(params.shopId);
    const card = await composeCard({
      flow: { ...params, signal: deadline.signal },
      systemPrompt: buildMarketReportSystemPrompt(),
      userPrompt: buildMarketReportUserPrompt({
        market: params.market,
        keywords: params.keywords ?? [],
        categoryName: category.name,
        granularity: granularityOf(category),
        dataJson: JSON.stringify({ ranking, metrics, prices }),
        shopContext,
      }),
      parse: (text) => parseMarketCard(text, params.market),
    });
    return { summary: marketSummary(card), card };
  } finally {
    deadline.clear();
    void client.close();
  }
}

// 故事 14 选品方向推荐：品类解析 → 二级品类榜单 + 品类热销商品榜 → 模型归纳 2-3 个方向。
export async function runProductRecommendation(params: SelectionFlowParams): Promise<SelectionComposition<RecommendationDetails>> {
  const region = regionOf(params.market);
  const deadline = createDeadlineSignal(params.signal);
  const client = await createFastmossClient(await readFastmossSettings("选品功能"));
  try {
    const category = await resolveCategory(client, params.keywords ?? [], deadline.signal);
    const weekFilter = { category_id: category.level1, date_type: "week", date_value: lastIsoWeekValue(new Date()), region };
    const ranking = await client.callTool("market_category_ranking", {
      filter: weekFilter,
      lang: "ZH_CN",
      orderby: [{ field: "category_units_sold_yoy_percent", order: "desc" }],
    }, deadline.signal);
    const products = await client.callTool("product_rank_top_selling", {
      filter: { ...weekFilter, category_id: category.level2 ?? category.level1 },
      orderby: [{ field: "units_sold_growth_rate_percent", order: "desc" }],
      page: 1,
      pagesize: 10,
    }, deadline.signal);
    const shopContext = await buildShopContext(params.shopId);
    const card = await composeCard({
      flow: { ...params, signal: deadline.signal },
      systemPrompt: buildRecommendSystemPrompt(),
      userPrompt: buildRecommendUserPrompt({
        market: params.market,
        keywords: params.keywords ?? [],
        categoryName: category.name,
        granularity: granularityOf(category),
        dataJson: JSON.stringify({ ranking, products }),
        shopContext,
      }),
      parse: (text) => parseRecommendationCard(text, params.market),
    });
    return { summary: recommendationSummary(card), card };
  } finally {
    deadline.clear();
    void client.close();
  }
}

// 故事 15 竞品分析：店铺搜索 → 商品结构（定价/上新）→ 销售渠道（流量结构）→ 视频分析（内容风格）→ 模型组合对比报告卡。
export async function runCompetitorAnalysis(params: SelectionFlowParams): Promise<SelectionComposition<CompetitorDetails>> {
  const region = regionOf(params.market);
  const deadline = createDeadlineSignal(params.signal);
  const client = await createFastmossClient(await readFastmossSettings("选品功能"));
  try {
    const search = await client.callTool("shop_search", {
      filter: { region, shop_name: params.shopKeyword ?? "" },
      page: 1,
      pagesize: 10,
      orderby: [],
    }, deadline.signal);
    const rawShops = (search as { shops?: unknown }).shops;
    const shops = Array.isArray(rawShops) ? rawShops.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
    const target = shops.find((shop) => typeof shop.seller_id === "string" || typeof shop.seller_id === "number");
    if (!target) throw new AppError("FastMoss 未找到该竞品店铺，请确认店铺名称或关键词", "FASTMOSS_NOT_FOUND", 404);
    const sellerId = String(target.seller_id);
    const shopName = typeof target.shop_name === "string" ? target.shop_name : (params.shopKeyword ?? "未命名店铺");
    const products = await client.callTool("shop_product_analysis", {
      filter: { seller_id: sellerId, time_range_days: 28 },
      page: 1,
      pagesize: 10,
    }, deadline.signal);
    const sales = await client.callTool("shop_sale_analysis", {
      filter: { seller_id: sellerId, time_range_days: 28 },
    }, deadline.signal);
    const videos = await client.callTool("shop_video_analysis", {
      filter: { seller_id: sellerId, time_range_days: 28 },
      page: 1,
      pagesize: 10,
    }, deadline.signal);
    const shopContext = await buildShopContext(params.shopId);
    const card = await composeCard({
      flow: { ...params, signal: deadline.signal },
      systemPrompt: buildCompetitorSystemPrompt(),
      userPrompt: buildCompetitorUserPrompt({
        market: params.market,
        shopKeyword: params.shopKeyword ?? "",
        shopName,
        dataJson: JSON.stringify({ products, sales, videos }),
        shopContext,
      }),
      parse: (text) => parseCompetitorCard(text),
    });
    return { summary: competitorSummary(card), card };
  } finally {
    deadline.clear();
    void client.close();
  }
}
