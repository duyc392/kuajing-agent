// 用途：评论与留言抓取服务：对外部数据源做适配，统一清洗（去重/过滤灌水/统计星级）后返回原始文本。
// 只返回文本与统计口径，不做痛点提炼、不做情感判断——这些是 Skill SOP 交给主 Agent 完成的推理。
// 数据源：优先 FastMoss MCP（若账号开通了评论接口）；也支持卖家直接粘贴的评论文本，保证离线可用。
import { AppError, ValidationError } from "@/lib/errors";
import { createFastmossClient, readFastmossSettings } from "@/lib/fastmoss-client";
import { filterReviews, ratingCounts } from "@/lib/review-analysis";
import type { ProductReviewsDetails, ReviewItem, VideoCommentItem, VideoCommentsDetails } from "@/types";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

// 粘贴文本的宽松解析：支持「1★ 太差了」「5 stars: great」「4/5 ...」三种常见形态，解析不到的按无星级处理。
const RATING_PREFIX = /^\s*(?:(\d)\s*(?:★|星|stars?|分)|\s*(\d)\s*\/\s*5)\s*[:：]?\s*/i;

function parsePastedReviews(text: string): ReviewItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const match = RATING_PREFIX.exec(line);
      const rating = match ? Number(match[1] ?? match[2]) : null;
      const body = match ? line.slice(match[0].length).trim() : line;
      return { rating: rating !== null && rating >= 1 && rating <= 5 ? rating : null, text: body, date: null, verified: false };
    });
}

function clampLimit(limit: number | undefined): number {
  const value = Math.floor(limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

interface RawReviewLike {
  text?: unknown;
  rating?: unknown;
  date?: unknown;
  verified?: unknown;
}

function toReviewItem(raw: RawReviewLike): ReviewItem {
  const rating = typeof raw.rating === "number" && raw.rating >= 1 && raw.rating <= 5 ? Math.round(raw.rating) : null;
  return {
    rating,
    text: typeof raw.text === "string" ? raw.text.trim() : "",
    date: typeof raw.date === "string" ? raw.date : null,
    verified: raw.verified === true,
  };
}

// FastMoss 评论接口：不同账号开通情况不一致，失败时给出可执行的替代方案而不是空结果。
async function fetchFromFastmoss(params: { target: string; platform: string; limit: number; signal?: AbortSignal }): Promise<ReviewItem[]> {
  const client = await createFastmossClient(await readFastmossSettings("评论抓取"));
  try {
    let data: unknown;
    try {
      data = await client.callTool("product_reviews", {
        filter: { platform: params.platform, keyword: params.target },
        page: 1,
        pagesize: params.limit,
        orderby: [],
      }, params.signal);
    } catch (error) {
      // 接口不存在 / 未开通 / 额度不足都归到这里：原始原因只进日志，前端给可执行的替代方案。
      console.error("[reviews] FastMoss 评论接口调用失败:", error);
      throw new AppError(
        "当前数据源无法抓取评论（可能未开通评论接口）。请把评论原文粘贴给 Agent，并用 reviewsText 参数继续分析",
        "REVIEWS_UNSUPPORTED",
        501,
      );
    }
    const raw = (data as { reviews?: unknown }).reviews;
    if (!Array.isArray(raw)) {
      throw new AppError("当前数据源没有返回评论列表，请把评论原文粘贴给 Agent 后用 reviewsText 参数继续", "REVIEWS_UNSUPPORTED", 501);
    }
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => toReviewItem(item as RawReviewLike))
      .filter((item) => item.text !== "");
  } finally {
    void client.close();
  }
}

export async function fetchProductReviews(params: {
  target: string;
  platform: "tiktok" | "amazon";
  limit?: number;
  stars?: number[];
  reviewsText?: string;
  signal?: AbortSignal;
}): Promise<ProductReviewsDetails> {
  const limit = clampLimit(params.limit);
  if (params.target.trim() === "" && (params.reviewsText ?? "").trim() === "") {
    throw new ValidationError("请提供商品链接/ID，或把评论文本粘贴进来");
  }
  const raw = (params.reviewsText ?? "").trim() !== ""
    ? parsePastedReviews(params.reviewsText ?? "")
    : await fetchFromFastmoss({ target: params.target, platform: params.platform, limit, signal: params.signal });
  const drawn = params.stars === undefined || params.stars.length === 0
    ? raw
    : raw.filter((review) => review.rating !== null && params.stars?.includes(review.rating));
  const filtered = filterReviews(drawn);
  const reviews = filtered.kept.slice(0, limit);
  return {
    target: params.target,
    platform: params.platform,
    total: drawn.length,
    stats: {
      deduped: filtered.deduped,
      spamFiltered: filtered.spamFiltered,
      ratingCounts: ratingCounts(drawn.map((review) => review.rating)),
    },
    reviews,
    truncated: filtered.kept.length > reviews.length,
  };
}

interface RawCommentLike {
  text?: unknown;
  likes?: unknown;
  videoId?: unknown;
}

export async function fetchVideoComments(params: {
  videoUrl: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<VideoCommentsDetails> {
  const limit = clampLimit(params.limit);
  if (params.videoUrl.trim() === "") throw new ValidationError("请提供视频链接");
  const client = await createFastmossClient(await readFastmossSettings("视频评论抓取"));
  try {
    const data = await client.callTool("video_comments", {
      filter: { video_url: params.videoUrl },
      page: 1,
      pagesize: limit,
      orderby: [{ field: "like_count", order: "desc" }],
    }, params.signal);
    const raw = (data as { comments?: unknown }).comments;
    if (!Array.isArray(raw)) {
      throw new AppError("当前 FastMoss 账号未开通视频评论接口，可把高赞留言粘贴给 Agent 后手工分析", "COMMENTS_UNSUPPORTED", 501);
    }
    const comments: VideoCommentItem[] = raw
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => {
        const value = item as RawCommentLike;
        return {
          text: typeof value.text === "string" ? value.text.trim() : "",
          likes: typeof value.likes === "number" ? value.likes : null,
          videoId: typeof value.videoId === "string" ? value.videoId : null,
        };
      })
      .filter((item) => item.text !== "");
    const filtered = filterReviews(comments);
    return {
      videoUrl: params.videoUrl,
      total: comments.length,
      stats: { deduped: filtered.deduped, spamFiltered: filtered.spamFiltered },
      comments: filtered.kept.slice(0, limit),
      truncated: filtered.kept.length > limit,
    };
  } finally {
    void client.close();
  }
}
