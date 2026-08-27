// 用途：内容运营外部数据源契约（模块一 Mock，后续爬虫或 API 确定后只替换这里的实现注入，不改调用方）。
// 所有方法必须传 shopId（隔离铁律）；返回视图类型，不暴露 Prisma 模型。
import type { ContentReferenceView, PublishedVideoView, VideoReviewView } from "@/types/content";
import { createMockContentOpsSource } from "@/services/mock-content-ops-source";

export interface ContentOpsSource {
  /** 采集某个商品的爆款内容拆解。 */
  collectContentReferences(shopId: string, productId: string): Promise<ContentReferenceView[]>;
  /** 拉取某个商品的已发布视频及投放数据。 */
  loadPublishedVideos(shopId: string, productId: string): Promise<PublishedVideoView[]>;
  /** 拉取某条已发布视频的复盘，没有时返回 null。 */
  loadVideoReview(shopId: string, publishedVideoId: string): Promise<VideoReviewView | null>;
}

// 当前唯一实现为固定 Mock；数据来源确定后在实现文件替换并回到此处切换注入。
export function getContentOpsSource(): ContentOpsSource {
  return createMockContentOpsSource();
}
