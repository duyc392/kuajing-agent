// 用途：评论与留言抓取工具：只取原始文本 + 确定性统计（去重/灌水过滤/星级分布），不做痛点提炼。
// 痛点与卖点由主 Agent 按「受众痛点」SOP 推理，并用 verify_citations 核对引文。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { fetchProductReviews, fetchVideoComments } from "@/services/reviews.service";
import type { ProductReviewsDetails, VideoCommentsDetails } from "@/types";

const reviewsSchema = Type.Object({
  target: Type.String({ description: "商品链接或商品 ID；使用 reviewsText 时可留空字符串", maxLength: 500 }),
  platform: Type.Union([Type.Literal("tiktok"), Type.Literal("amazon")], { description: "评论来源平台：tiktok 小店 / amazon 同款" }),
  limit: Type.Optional(Type.Integer({ description: "最多返回条数，默认 200，上限 500", minimum: 1, maximum: 500 })),
  stars: Type.Optional(
    Type.Array(Type.Integer({ minimum: 1, maximum: 5 }), { description: "只看这些星级，如 [1,2,3] 只看差评；不填则全部" }),
  ),
  reviewsText: Type.Optional(
    Type.String({ description: "卖家直接粘贴的评论文本（每行一条，可带「1★」前缀）；提供时不再走数据接口", maxLength: 60000 }),
  ),
});

const commentsSchema = Type.Object({
  videoUrl: Type.String({ description: "TikTok 视频链接", minLength: 8, maxLength: 500, pattern: "\\S" }),
  limit: Type.Optional(Type.Integer({ description: "最多返回条数，默认 200，上限 500", minimum: 1, maximum: 500 })),
});

type ReviewsParams = Static<typeof reviewsSchema>;
type CommentsParams = Static<typeof commentsSchema>;

export function createFetchReviewsTool(): AgentTool<typeof reviewsSchema, ProductReviewsDetails> {
  return {
    name: "fetch_product_reviews",
    label: "抓取商品评论",
    description:
      "抓取目标商品的真实用户评价（优先 1-3 星差评）并返回原文与统计口径（去重后条数、星级分布、过滤掉的灌水条数）。只返回文本，不提炼痛点、不做情感分析。没有可用评论接口时，把评论粘贴到 reviewsText 参数即可离线分析。",
    parameters: reviewsSchema,
    async execute(_toolCallId, params: ReviewsParams, signal?: AbortSignal): Promise<AgentToolResult<ProductReviewsDetails>> {
      const details = await fetchProductReviews({
        target: params.target.trim(),
        platform: params.platform,
        limit: params.limit,
        stars: params.stars,
        reviewsText: params.reviewsText,
        signal,
      });
      const text = [
        `已取到 ${details.total} 条评价（去重 ${details.stats.deduped} 条、过滤灌水 ${details.stats.spamFiltered} 条）。`,
        `星级分布：${Object.entries(details.stats.ratingCounts).map(([star, count]) => `${star}星 ${count}`).join("，")}`,
        details.truncated ? `返回条数已达上限，仅提供前 ${details.reviews.length} 条。` : `返回 ${details.reviews.length} 条。`,
        "统计数字以本结果为准，不要用页面上的总评论数当分母；引文必须来自 reviews 里的 text 原文。",
      ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}

export function createFetchCommentsTool(): AgentTool<typeof commentsSchema, VideoCommentsDetails> {
  return {
    name: "fetch_video_comments",
    label: "抓取视频留言",
    description:
      "抓取某条 TikTok 视频的高赞评论区留言，返回原文、点赞数与去重统计。只返回文本，不做舆情判断；需要提炼受众观点时按痛点 SOP 自行分析。",
    parameters: commentsSchema,
    async execute(_toolCallId, params: CommentsParams, signal?: AbortSignal): Promise<AgentToolResult<VideoCommentsDetails>> {
      const details = await fetchVideoComments({ videoUrl: params.videoUrl.trim(), limit: params.limit, signal });
      const text = [
        `已取到 ${details.total} 条留言（去重 ${details.stats.deduped} 条、过滤灌水 ${details.stats.spamFiltered} 条）。`,
        details.truncated ? `返回前 ${details.comments.length} 条。` : `返回 ${details.comments.length} 条。`,
        "留言是用户原话，引用时不要改写。",
      ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}
