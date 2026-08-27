// 用途：Mock 内容数据源单元测试：数据格式正确、shopId/productId 全部带齐、类型与状态落在白名单内、
// 复盘按约定返回（有/无两种形态）、ID 确定性（两次调用一致）。
import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT_ANGLES, PUBLISHED_VIDEO_STATUSES } from "@/config/content";
import { createMockContentOpsSource } from "@/services/mock-content-ops-source";

const SHOP_ID = "shop-mock";
const PRODUCT_ID = "prod-mock";

test("collectContentReferences 返回的每条记录都带 shopId 与 productId 且字段完整", async () => {
  const source = createMockContentOpsSource();
  const refs = await source.collectContentReferences(SHOP_ID, PRODUCT_ID);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    assert.equal(ref.shopId, SHOP_ID);
    assert.equal(ref.productId, PRODUCT_ID);
    assert.ok(ref.id.length > 0);
    assert.ok(ref.title.length > 0);
    assert.ok(ref.hook.length > 0);
    assert.ok(ref.cta.length > 0);
    assert.ok(ref.playCount > 0);
    assert.ok((CONTENT_ANGLES as readonly string[]).includes(ref.angle));
    // collectedAt / createdAt 必须是可解析的 ISO 时间。
    assert.ok(!Number.isNaN(Date.parse(ref.collectedAt)));
    assert.ok(!Number.isNaN(Date.parse(ref.createdAt)));
  }
});

test("loadPublishedVideos 返回的每条记录都带 shopId 且留存为有限数字数组", async () => {
  const source = createMockContentOpsSource();
  const videos = await source.loadPublishedVideos(SHOP_ID, PRODUCT_ID);
  assert.ok(videos.length > 0);
  for (const video of videos) {
    assert.equal(video.shopId, SHOP_ID);
    assert.equal(video.productId, PRODUCT_ID);
    assert.ok((PUBLISHED_VIDEO_STATUSES as readonly string[]).includes(video.status));
    assert.ok((CONTENT_ANGLES as readonly string[]).includes(video.angle));
    assert.ok(video.retentionData.length > 0);
    assert.ok(video.retentionData.every((value) => Number.isFinite(value)));
    assert.ok(video.gmv >= 0);
    assert.ok(video.orderCount >= 0);
  }
});

test("loadVideoReview 对第一条视频返回复盘，对其余视频返回 null", async () => {
  const source = createMockContentOpsSource();
  const videos = await source.loadPublishedVideos(SHOP_ID, PRODUCT_ID);
  const withReview = videos.find((video) => video.id.endsWith("-1"));
  assert.ok(withReview);
  const review = await source.loadVideoReview(SHOP_ID, withReview.id);
  assert.ok(review);
  assert.equal(review.shopId, SHOP_ID);
  assert.equal(review.publishedVideoId, withReview.id);
  assert.ok(review.summary.length > 0);
  assert.ok(review.suggestions.length > 0);
  const withoutReview = videos.find((video) => !video.id.endsWith("-1"));
  assert.ok(withoutReview);
  assert.equal(await source.loadVideoReview(SHOP_ID, withoutReview.id), null);
});

test("两次调用的 ID 与数据一致（确定性 Mock）", async () => {
  const first = createMockContentOpsSource();
  const second = createMockContentOpsSource();
  const [refsA, refsB] = await Promise.all([
    first.collectContentReferences(SHOP_ID, PRODUCT_ID),
    second.collectContentReferences(SHOP_ID, PRODUCT_ID),
  ]);
  assert.deepEqual(refsA, refsB);
});
