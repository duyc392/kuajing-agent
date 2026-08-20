// 用途：数据看板汇总逻辑（PRD 故事 31）：实时查询 FastMoss MCP 汇总店铺级 GMV、销量、流量来源、
// 内容表现与类目表现，派生视频转化率（销量 ÷ 播放量）；不落库，纯读外部数据源。
import { AppError, NotFoundError } from "@/lib/errors";
import { createFastmossClient, readFastmossSettings, type FastmossMCPClient } from "@/lib/fastmoss-client";
import type {
  DashboardCategoryItem,
  DashboardContentItem,
  DashboardData,
  DashboardQuery,
  DashboardShareItem,
  DashboardTrendPoint,
} from "@/types";

const QUERY_DEADLINE_MS = 30_000;
const TOP_LIMIT = 5;
const MAX_SHARE_ITEMS = 6;
const TITLE_MAX_CHARS = 60;
const TREND_MAX_POINTS = 30;

// 渠道标签 → 中文名（未知标签原样保留）。
function channelLabel(label: string): string {
  const labels: Record<string, string> = {
    video: "短视频",
    live: "直播",
    product_card: "商品卡",
    affiliate: "联盟达人",
    shop_account: "店铺自营",
  };
  return labels[label] ?? label;
}

function numberOr(item: unknown, key: string): number {
  const value = (item as Record<string, unknown> | null)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOr(item: unknown, key: string): string {
  const value = (item as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : "";
}

// 店铺搜索 → seller_id 与基础信息；找不到给中文 404。
async function resolveShop(client: FastmossMCPClient, query: DashboardQuery, signal?: AbortSignal): Promise<{ sellerId: string; shopName: string; rating: number | null }> {
  const data = await client.callTool("shop_search", {
    filter: { region: query.region, shop_name: query.shopName },
    page: 1,
    pagesize: 10,
    orderby: [],
  }, signal);
  const raw = (data as { shops?: unknown }).shops;
  const shops = Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
  // 精确匹配优先：宽泛关键词命中多家店铺时，优先取名称全等的记录（不区分大小写），避免把别家店的数据当成目标店。
  const hasSellerId = (shop: Record<string, unknown>) => typeof shop.seller_id === "string" || typeof shop.seller_id === "number";
  const wanted = query.shopName.trim().toLowerCase();
  const target =
    shops.find((shop) => hasSellerId(shop) && stringOr(shop, "shop_name").toLowerCase() === wanted) ?? shops.find(hasSellerId);
  if (!target) throw new NotFoundError("FastMoss 未找到该店铺，请确认店铺名称");
  return {
    sellerId: String(target.seller_id),
    shopName: stringOr(target, "shop_name") || query.shopName,
    rating: typeof target.shop_rating === "number" ? target.shop_rating : null,
  };
}

// 趋势序列超出 30 点时等距降采样（首尾点必含，总数恰不超过 30）：图表覆盖完整查询周期（近 90 天也从头画到尾），不截掉前段。
function sampleTrend(points: DashboardTrendPoint[]): DashboardTrendPoint[] {
  if (points.length <= TREND_MAX_POINTS) return points;
  const indices = new Set<number>([points.length - 1]);
  for (let i = 0; i < TREND_MAX_POINTS - 1; i++) indices.add(Math.round((i * (points.length - 1)) / (TREND_MAX_POINTS - 1)));
  return [...indices].sort((a, b) => a - b).map((index) => points[index]);
}

// 趋势数据 → 周期汇总 + 展示序列（只保留有日期的有效点）。
// 汇总必须用完整周期全量点（近 90 天 = 90 点求和）；展示序列独立降采样——两者不可共用同一截断，否则卡片口径与标签不符。
function mapTrend(data: unknown): { trend: DashboardTrendPoint[]; gmv: number; unitsSold: number } {
  const raw = (data as { daily_trend?: unknown }).daily_trend;
  const points: DashboardTrendPoint[] = Array.isArray(raw)
    ? raw
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({ date: stringOr(item, "date"), gmv: numberOr(item, "daily_gmv"), unitsSold: numberOr(item, "daily_units_sold") }))
        .filter((point) => point.date !== "")
    : [];
  return {
    trend: sampleTrend(points),
    gmv: points.reduce((sum, point) => sum + point.gmv, 0),
    unitsSold: points.reduce((sum, point) => sum + point.unitsSold, 0),
  };
}

// 占比分布 → 中文标签列表（过滤零占比噪音项）。
function mapShares(data: unknown, key: string, labelKey: string, valueKey: string): DashboardShareItem[] {
  const raw = (data as Record<string, unknown> | null)?.[key];
  const byGmv = (raw as { by_gmv?: unknown } | null)?.by_gmv;
  if (!Array.isArray(byGmv)) return [];
  return byGmv
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      label: channelLabel(stringOr(item, labelKey)),
      gmvSharePercent: numberOr(item, valueKey),
    }))
    .filter((item) => item.label !== "" && item.gmvSharePercent > 0)
    .slice(0, MAX_SHARE_ITEMS);
}

// 视频列表 → 内容表现 Top N（转化率 = 销量 ÷ 播放量，代码计算）。
function mapContents(data: unknown): { items: DashboardContentItem[]; videoCount: number; conversionRatePercent: number | null } {
  const summary = (data as { summary?: unknown } | null)?.summary as Record<string, unknown> | null;
  const videoCount = typeof summary?.video_count === "number" ? summary.video_count : 0;
  const raw = ((data as { videos?: unknown } | null)?.videos as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return { items: [], videoCount, conversionRatePercent: null };
  const items: DashboardContentItem[] = raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const plays = numberOr((item as Record<string, unknown>).engagement_metrics, "play_count");
      const unitsSold = numberOr((item as Record<string, unknown>).commerce_metrics, "video_units_sold");
      return {
        title: stringOr(item, "caption_text").slice(0, TITLE_MAX_CHARS) || "（无标题）",
        plays,
        unitsSold,
        conversionRatePercent: plays > 0 ? (unitsSold / plays) * 100 : 0,
      };
    })
    .filter((item) => item.plays > 0 || item.unitsSold > 0)
    .slice(0, TOP_LIMIT);
  const totalPlays = items.reduce((sum, item) => sum + item.plays, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.unitsSold, 0);
  const conversionRatePercent = totalPlays > 0 ? (totalUnits / totalPlays) * 100 : null;
  return { items, videoCount, conversionRatePercent };
}

// 类目分布（二级类目按 GMV）→ 类目表现 Top N。
function mapCategories(data: unknown): DashboardCategoryItem[] {
  const raw = (data as { category_distribution?: unknown } | null)?.category_distribution as
    | { by_gmv?: { level_2?: unknown } }
    | null;
  const level2 = raw?.by_gmv?.level_2;
  if (!Array.isArray(level2)) return [];
  return level2
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({ name: stringOr(item, "category_name"), gmvSharePercent: numberOr(item, "gmv_share_percent") }))
    .filter((item) => item.name !== "" && item.gmvSharePercent > 0)
    .slice(0, TOP_LIMIT);
}

export async function getDashboard(query: DashboardQuery): Promise<DashboardData> {
  const settings = await readFastmossSettings("数据看板");
  const client = await createFastmossClient(settings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_DEADLINE_MS);
  try {
    const { sellerId, shopName, rating } = await resolveShop(client, query, controller.signal);
    const [trendsData, saleData, videoData, productData] = await Promise.all([
      client.callTool("shop_data_trends", { filter: { seller_id: sellerId, time_range_days: query.timeRangeDays } }, controller.signal),
      client.callTool("shop_sale_analysis", { filter: { seller_id: sellerId, time_range_days: query.timeRangeDays } }, controller.signal),
      client.callTool("shop_video_analysis", { filter: { seller_id: sellerId, time_range_days: query.timeRangeDays }, page: 1, pagesize: 10 }, controller.signal),
      client.callTool("shop_product_analysis", { filter: { seller_id: sellerId, time_range_days: query.timeRangeDays }, page: 1, pagesize: 10 }, controller.signal),
    ]);
    const { trend, gmv, unitsSold } = mapTrend(trendsData);
    const { items: topContents, videoCount, conversionRatePercent } = mapContents(videoData);
    return {
      shopName,
      region: query.region,
      timeRangeDays: query.timeRangeDays,
      gmv,
      unitsSold,
      rating,
      videoCount,
      videoConversionRatePercent: conversionRatePercent,
      trend,
      contentChannels: mapShares(saleData, "content_type_distribution", "content_type_label", "gmv_share_percent"),
      salesChannels: mapShares(saleData, "sales_channel_distribution", "sales_channel_label", "gmv_share_percent"),
      topContents,
      categories: mapCategories(productData),
    };
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof AppError)) {
      throw new AppError("数据看板查询超时，请稍后重试", "DASHBOARD_TIMEOUT", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    void client.close();
  }
}
