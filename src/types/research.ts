// 用途：内容研究域类型：外部评论/留言抓取、竞品视频解析（逐字稿/关键帧/切镜节奏）、店铺知识库检索与异步任务状态。
// 这些类型是原子工具与前端卡片共用的跨层契约；工具只返回原始结构化数据，解读由主 Agent 按 Skill SOP 完成。

export const FETCH_MARKET_DATA_TOOL_NAME = "fetch_market_data";
export const FETCH_PRODUCT_REVIEWS_TOOL_NAME = "fetch_product_reviews";
export const FETCH_VIDEO_COMMENTS_TOOL_NAME = "fetch_video_comments";
export const FETCH_VIDEO_SOURCE_TOOL_NAME = "fetch_video_source";
export const TRANSCRIBE_VIDEO_TOOL_NAME = "transcribe_video";
export const EXTRACT_VIDEO_FRAMES_TOOL_NAME = "extract_video_frames";
export const COMPUTE_CUT_RHYTHM_TOOL_NAME = "compute_cut_rhythm";
export const QUERY_SHOP_KNOWLEDGE_TOOL_NAME = "query_shop_knowledge_base";
export const GET_ASYNC_TASK_TOOL_NAME = "get_async_task";

// ================= 异步任务 =================

export type AsyncTaskStatus = "running" | "done" | "error";

export interface AsyncTaskSnapshot {
  taskId: string;
  kind: string;
  status: AsyncTaskStatus;
  /** 结果只在 done 时存在，结构由发起任务的工具决定 */
  result?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/** 长任务工具的统一返回：立即拿 taskId，模型用 get_async_task 轮询结果。 */
export interface AsyncTaskHandleDetails {
  taskId: string;
  kind: string;
  status: AsyncTaskStatus;
}

// ================= 评论与留言 =================

export type ReviewSource = "review" | "comment";

export interface ReviewItem {
  rating: number | null;
  text: string;
  date: string | null;
  verified: boolean;
}

export interface VideoCommentItem {
  text: string;
  likes: number | null;
  videoId: string | null;
}

export interface ProductReviewsDetails {
  target: string;
  platform: "tiktok" | "amazon";
  total: number;
  /** 工具侧确定性统计：去重后条数、星级分布、垃圾条数 */
  stats: { deduped: number; spamFiltered: number; ratingCounts: Record<string, number> };
  reviews: ReviewItem[];
  truncated: boolean;
}

export interface VideoCommentsDetails {
  videoUrl: string;
  total: number;
  stats: { deduped: number; spamFiltered: number };
  comments: VideoCommentItem[];
  truncated: boolean;
}

// ================= 竞品视频解析 =================

export interface VideoAssetDetails {
  assetId: string;
  videoUrl: string;
  diskPath: string;
  publicPath: string | null;
  durationSeconds: number | null;
  bytes: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptDetails {
  assetId: string;
  language: string | null;
  segments: TranscriptSegment[];
  fullText: string;
  /** 逐字稿覆盖时长 / 视频时长，用于判断能不能拆解 */
  coverage: number;
  srtPath: string | null;
}

export interface KeyframeItem {
  timeSeconds: number;
  publicPath: string;
  diskPath: string;
}

export interface KeyframeDetails {
  assetId: string;
  intervalSeconds: number;
  frames: KeyframeItem[];
}

export interface CutRhythmDetails {
  assetId: string;
  durationSeconds: number;
  cutCount: number;
  cuts: number[];
  cutsPerTenSeconds: number;
  longestShotSeconds: number;
  averageShotSeconds: number;
}

/** 素材拼接成可拆解的输入：三层工具都产出这里的一部分，主 Agent 汇总后交给 Skill 判断。 */
export interface VideoPackDetails {
  asset: VideoAssetDetails;
  transcript: TranscriptDetails;
  frames: KeyframeDetails;
  rhythm: CutRhythmDetails;
}

// ================= 店铺知识库 =================

export const SHOP_KNOWLEDGE_SCOPES = ["brand", "audience", "scripts", "products", "all"] as const;
export type ShopKnowledgeScope = (typeof SHOP_KNOWLEDGE_SCOPES)[number];

export interface KnowledgeSnippet {
  source: "shop" | "memory" | "product" | "script" | "knowledge";
  title: string;
  content: string;
  score: number;
}

export interface ShopKnowledgeDetails {
  query: string;
  scope: ShopKnowledgeScope;
  snippets: KnowledgeSnippet[];
}

// ================= 三方大盘数据 =================

export type MarketPeriod = "week" | "month";

export interface MarketCategoryRef {
  level1: number;
  level2: number | null;
  name: string;
  level1Name: string;
}

/** fetch_market_data 的返回：原始数据 + 由代码算好的查询口径说明，不做任何结论。 */
export interface MarketDatasetDetails {
  market: string;
  region: string;
  period: MarketPeriod;
  periodValue: string;
  category: MarketCategoryRef;
  /** 指标实际统计的粒度（一级类目 vs 关键词匹配的细分方向），防止报告夸大数据口径 */
  granularityNote: string;
  ranking: unknown;
  metrics: unknown;
  priceDistribution: unknown;
  topProducts: unknown;
  shops: unknown;
}

/** 竞品店铺取数：只返回店铺与商品/销售/视频原始数据。 */
export interface CompetitorShopDetails {
  market: string;
  region: string;
  shopName: string;
  sellerId: string;
  products: unknown;
  sales: unknown;
  videos: unknown;
}
