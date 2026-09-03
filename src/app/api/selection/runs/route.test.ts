// 用途：选品 runs 路由入参测试（直接调用 route handler，不启动 Next 服务器）：
// 空 payload 400、非法市场 400、合法请求 200 且候选数量与过滤合规、店铺不存在 404。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../../../../prisma/test-utils";

test("选品 runs 路由：入参校验与错误响应", async () => {
  const { prisma, url, dbPath } = createTempDb("selection-route-test");
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    const { POST } = await import("@/app/api/selection/runs/route");
    const post = (body: unknown): Promise<Response> => POST(new Request("http://local/api/selection/runs", { method: "POST", body: JSON.stringify(body) }));

    const empty = await post({});
    assert.equal(empty.status, 400);
    assert.equal(((await empty.json()) as { code: string }).code, "VALIDATION_ERROR");

    const badRegion = await post({
      shopId: "s-a",
      filters: { targetRegion: "XX", targetCategory: "Beauty", priceRange: { min: 20, max: 40 }, minMarginRate: 0.45, maxWeightGrams: 500, isProhibitedGoodsExcluded: true },
    });
    assert.equal(badRegion.status, 400);

    const noShop = await post({
      shopId: "s-none",
      filters: { targetRegion: "US", targetCategory: "Beauty", priceRange: { min: 20, max: 40 }, minMarginRate: 0.45, maxWeightGrams: 500, isProhibitedGoodsExcluded: true },
    });
    assert.equal(noShop.status, 404, "店铺不存在 → NotFoundError 404");

    const ok = await post({
      shopId: "s-a",
      filters: { targetRegion: "US", targetCategory: "Beauty", priceRange: { min: 20, max: 40 }, minMarginRate: 0.45, maxWeightGrams: 500, isProhibitedGoodsExcluded: true },
    });
    assert.equal(ok.status, 200);
    const result = (await ok.json()) as { candidates: Array<{ candidateId: string; netMarginRate: number }> };
    assert.ok(result.candidates.length >= 15);
    assert.ok(result.candidates.every((candidate) => candidate.netMarginRate >= 0.45), "严格过滤生效");
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
