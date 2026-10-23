// 用途：三方大盘数据服务（FastMoss MCP）：品类解析 → 榜单 → 品类指标 → 价格带 → 热销商品，返回归一化的原始数据。
// 本服务不做任何结论、不调用模型：解读由主 Agent 按选品 SOP 完成。
// 与数据看板共用 lib/fastmoss-client 的配置读取与会话管理，未配置 Key 时给中文引导。
import { AppError, ValidationError } from "@/lib/errors";
import { marketToRegion } from "@/lib/markets";
import { createFastmossClient, readFastmossSettings, type FastmossMCPClient } from "@/lib/fastmoss-client";
import type { MarketCategoryRef, MarketDatasetDetails, MarketPeriod, CompetitorShopDetails } from "@/types";

const FLOW_DEADLINE_MS = 30_000;

export interface MarketQueryParams {
  keywords: string[];
  market: string;
  period: MarketPeriod;
  topN: number;
  signal?: AbortSignal;
}

// 市场中文名 → FastMoss 地域码；不支持的市场直接给中文错误。
export function regionOf(market: string): string {
  const region = marketToRegion(market);
  if (!region) throw new ValidationError("该市场暂不支持 FastMoss 数据查询");
  return region;
}

// 上周 ISO 周值（YYYY-ww）：FastMoss 周期参数只接受已完结周期，ISO 周不涉及时区歧义。
export function lastIsoWeekValue(now: Date): string {
  const thursdayOf = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + (3 - ((date.getUTCDay() + 6) % 7))));
  const firstThursday = (year: number) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    return new Date(Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  };
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  const thursday = thursdayOf(target);
  const week = 1 + Math.round((thursday.getTime() - firstThursday(thursday.getUTCFullYear()).getTime()) / (7 * 86400000));
  return `${thursday.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export function lastMonthValue(now: Date): string {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodValueOf(period: MarketPeriod, now: Date): string {
  return period === "week" ? lastIsoWeekValue(now) : lastMonthValue(now);
}

// 关键词 → 品类 ID：取最高分匹配的品类（含一级/二级 ID 与中文全路径名）。
async function resolveCategory(client: FastmossMCPClient, keywords: string[], signal?: AbortSignal): Promise<MarketCategoryRef> {
  const data = await client.callTool("search_category_by_words", { query: keywords, top_k: 5, max_total_results: 15 }, signal);
  const raw = (data as { categories?: unknown }).categories;
  const categories = Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
  const first = categories[0];
  if (!first || typeof first.category_id_level1 !== "number") {
    throw new AppError("FastMoss 未找到匹配的品类，请换个关键词重试", "FASTMOSS_CATEGORY", 404);
  }
  const name = typeof first.cn_full_name === "string" && first.cn_full_name.trim() !== "" ? first.cn_full_name : (keywords[0] ?? "未命名品类");
  return {
    level1: first.category_id_level1,
    level2: typeof first.category_id_level2 === "number" ? first.category_id_level2 : null,
    name,
    level1Name: name.split("-")[0] ?? name,
  };
}

// 查询粒度说明：指标按一级类目统计，关键词匹配到的细分方向单独标注，防止报告夸大数据口径。
function granularityOf(category: MarketCategoryRef): string {
  return `指标均基于一级类目「${category.level1Name}」统计；卖家关键词匹配到的细分方向为「${category.name}」，引用时须注明这一粒度差异。`;
}

function withDeadline(signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("market deadline")), FLOW_DEADLINE_MS);
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

async function collectDataset(
  client: FastmossMCPClient,
  params: MarketQueryParams,
  region: string,
  signal: AbortSignal,
): Promise<MarketDatasetDetails> {
  const category = await resolveCategory(client, params.keywords, signal);
  const periodValue = periodValueOf(params.period, new Date());
  const filter = { category_id: category.level1, date_type: params.period, date_value: periodValue, region };
  const ranking = await client.callTool("market_category_ranking", {
    filter,
    lang: "ZH_CN",
    orderby: [{ field: "category_units_sold", order: "desc" }],
  }, signal);
  const metrics = await client.callTool("market_category_analysis", { filter, analysis_type: "basic_metrics" }, signal);
  const priceDistribution = await client.callTool("market_category_analysis", { filter, analysis_type: "price_distribution" }, signal);
  const topProducts = await client.callTool("product_rank_top_selling", {
    filter: { ...filter, category_id: category.level2 ?? category.level1 },
    orderby: [{ field: "units_sold_growth_rate_percent", order: "desc" }],
    page: 1,
    pagesize: params.topN,
  }, signal);
  return {
    market: params.market,
    region,
    period: params.period,
    periodValue,
    category,
    granularityNote: granularityOf(category),
    ranking,
    metrics,
    priceDistribution,
    topProducts,
    shops: null,
  };
}

export async function fetchMarketDataset(params: MarketQueryParams): Promise<MarketDatasetDetails> {
  const region = regionOf(params.market);
  const deadline = withDeadline(params.signal);
  const client = await createFastmossClient(await readFastmossSettings("选品数据查询"));
  try {
    return await collectDataset(client, params, region, deadline.signal);
  } finally {
    deadline.clear();
    void client.close();
  }
}

// 竞品店铺取数：店铺搜索 → 商品结构 → 销售渠道 → 视频数据；找不到店铺给 404。
export async function fetchCompetitorShop(params: { shopKeyword: string; market: string; signal?: AbortSignal }): Promise<CompetitorShopDetails> {
  const region = regionOf(params.market);
  const deadline = withDeadline(params.signal);
  const client = await createFastmossClient(await readFastmossSettings("竞品数据查询"));
  try {
    const search = await client.callTool("shop_search", {
      filter: { region, shop_name: params.shopKeyword },
      page: 1,
      pagesize: 10,
      orderby: [],
    }, deadline.signal);
    const rawShops = (search as { shops?: unknown }).shops;
    const shops = Array.isArray(rawShops) ? rawShops.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
    const target = shops.find((shop) => typeof shop.seller_id === "string" || typeof shop.seller_id === "number");
    if (!target) throw new AppError("FastMoss 未找到该竞品店铺，请确认店铺名称或关键词", "FASTMOSS_NOT_FOUND", 404);
    const sellerId = String(target.seller_id);
    const shopName = typeof target.shop_name === "string" ? target.shop_name : params.shopKeyword;
    const filter = { seller_id: sellerId, time_range_days: 28 };
    const [products, sales, videos] = await Promise.all([
      client.callTool("shop_product_analysis", { filter, page: 1, pagesize: 10 }, deadline.signal),
      client.callTool("shop_sale_analysis", { filter }, deadline.signal),
      client.callTool("shop_video_analysis", { filter, page: 1, pagesize: 10 }, deadline.signal),
    ]);
    return { market: params.market, region, shopName, sellerId, products, sales, videos };
  } finally {
    deadline.clear();
    void client.close();
  }
}
