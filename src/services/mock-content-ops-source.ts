// 用途：内容运营数据源的固定 Mock 实现：返回确定性的演示数据（ID、日期固定），供模块一验证契约与后续界面开发；
// 数据来源（爬虫 / API）确定后，用真实实现替换本文件并在 content-ops-source.ts 切换注入。
import { CONTENT_ANGLES, PUBLISHED_VIDEO_STATUSES } from "@/config/content";
import type { ContentOpsSource } from "@/services/content-ops-source";
import type { ContentReferenceView, PublishedVideoView, VideoReviewView } from "@/types/content";

// 视角与状态取白名单首个值，保证 Mock 数据始终落在合法词表内。
const DEFAULT_ANGLE: ContentReferenceView["angle"] = CONTENT_ANGLES[0];
const DEFAULT_STATUS: PublishedVideoView["status"] = PUBLISHED_VIDEO_STATUSES[0];

const COLLECTED_AT = "2026-08-20T10:00:00.000Z";
const PUBLISHED_AT = "2026-08-12T12:00:00.000Z";

// 每个商品固定返回 2 条内容拆解：一条强钩子种草向、一条对比向，覆盖常用字段形态。
function buildReferences(shopId: string, productId: string): ContentReferenceView[] {
  return [
    {
      id: `mock-ref-${productId}-1`,
      shopId,
      productId,
      sourceVideoId: "7280000000000000001",
      sourceUrl: "https://www.tiktok.com/@mock/video/7280000000000000001",
      title: "This $12 gadget replaced my $60 one",
      angle: CONTENT_ANGLES[2],
      playCount: 2_400_000,
      conversionRate: 3.2,
      completionRate: 46,
      hook: "Stop overpaying for this.",
      sellingPoint: "同功能价格只要五分之一",
      highFrequencyQuestion: "和贵的那个有什么区别？",
      cta: "Grab yours before it sells out",
      collectedAt: COLLECTED_AT,
      createdAt: COLLECTED_AT,
    },
    {
      id: `mock-ref-${productId}-2`,
      shopId,
      productId,
      sourceVideoId: "7280000000000000002",
      sourceUrl: null,
      title: "Cheap vs expensive: can you tell?",
      angle: CONTENT_ANGLES[3],
      playCount: 860_000,
      conversionRate: null,
      completionRate: 38,
      hook: "One of these costs 5x more.",
      sellingPoint: null,
      highFrequencyQuestion: null,
      cta: "Comment which one you picked",
      collectedAt: COLLECTED_AT,
      createdAt: COLLECTED_AT,
    },
  ];
}

// 每个商品固定返回 2 条已发布视频：一条在跑且有留存曲线，一条已停止，覆盖两种状态形态。
function buildVideos(shopId: string, productId: string): PublishedVideoView[] {
  return [
    {
      id: `mock-pv-${productId}-1`,
      shopId,
      productId,
      scriptId: null,
      platformVideoId: "7290000000000000001",
      title: "Stop overpaying for this",
      angle: DEFAULT_ANGLE,
      durationSeconds: 30,
      playCount: 186_000,
      orderCount: 412,
      gmv: 8198.8,
      completionRate: 41,
      status: PUBLISHED_VIDEO_STATUSES[0],
      retentionData: [100, 86, 74, 66, 60, 56, 53, 51],
      publishedAt: PUBLISHED_AT,
      createdAt: PUBLISHED_AT,
      updatedAt: PUBLISHED_AT,
    },
    {
      id: `mock-pv-${productId}-2`,
      shopId,
      productId,
      scriptId: null,
      platformVideoId: null,
      title: "3 things I wish I knew before",
      angle: CONTENT_ANGLES[1],
      durationSeconds: 45,
      playCount: 52_000,
      orderCount: 61,
      gmv: 1210.4,
      completionRate: 22,
      status: PUBLISHED_VIDEO_STATUSES[1],
      retentionData: [100, 71, 49, 36, 29, 25],
      publishedAt: null,
      createdAt: PUBLISHED_AT,
      updatedAt: PUBLISHED_AT,
    },
  ];
}

// 只有第一条视频有复盘：演示「有复盘 / 无复盘」两种形态。
function buildReview(shopId: string, videoId: string): VideoReviewView {
  return {
    id: `mock-vr-${videoId}`,
    shopId,
    publishedVideoId: videoId,
    dropPointSeconds: 3,
    dropRate: 26,
    summary: "第 3 秒钩子结束进入产品介绍时流失最大，核心卖点出现太晚。",
    suggestions: ["把卖点对比提前到第 2 秒", "前 3 秒口播加价格锚点", "第 5 秒前出现字幕大字卖点"],
    generatedScriptId: null,
    createdAt: COLLECTED_AT,
    updatedAt: COLLECTED_AT,
  };
}

export function createMockContentOpsSource(): ContentOpsSource {
  return {
    async collectContentReferences(shopId: string, productId: string): Promise<ContentReferenceView[]> {
      return buildReferences(shopId, productId);
    },
    async loadPublishedVideos(shopId: string, productId: string): Promise<PublishedVideoView[]> {
      return buildVideos(shopId, productId);
    },
    async loadVideoReview(shopId: string, publishedVideoId: string): Promise<VideoReviewView | null> {
      // 只为以 -1 结尾的视频（每商品的第一条）提供复盘，其余返回 null。
      if (!publishedVideoId.endsWith("-1")) return null;
      return buildReview(shopId, publishedVideoId);
    },
  };
}
