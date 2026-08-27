// 用途：内容运营数据源入口（规格 2.3-2.7 数据契约）：统一把「店铺/商品/视频」的归属校验放在调数据源之前（P04：不存在或跨店铺一律 404，不泄露资源归属）；
// 数据源本身仍保持无状态 Mock 契约，后续替换真实实现时归属校验不重复维护。
import { NotFoundError } from "@/lib/errors";
import { getShop } from "@/services/shops.service";
import { getProduct } from "@/services/products.service";
import { getContentOpsSource } from "@/services/content-ops-source";
import type { ContentReferenceView, PublishedVideoView, VideoReviewView } from "@/types/content";

function notFound(resource: string): never {
  throw new NotFoundError(`${resource}不存在或无权访问`);
}

export async function collectContentReferences(shopId: string, productId: string): Promise<ContentReferenceView[]> {
  await getShop(shopId);
  await getProduct({ id: productId, shopId });
  return getContentOpsSource().collectContentReferences(shopId, productId);
}

export async function loadPublishedVideos(shopId: string, productId: string): Promise<PublishedVideoView[]> {
  await getShop(shopId);
  await getProduct({ id: productId, shopId });
  return getContentOpsSource().loadPublishedVideos(shopId, productId);
}

export async function loadVideoReview(shopId: string, productId: string, videoId: string): Promise<VideoReviewView | null> {
  await getShop(shopId);
  const source = getContentOpsSource();
  await getProduct({ id: productId, shopId });
  const video = (await source.loadPublishedVideos(shopId, productId)).find((item) => item.id === videoId);
  if (!video) notFound("视频");
  return source.loadVideoReview(shopId, videoId);
}
