// 用途：店铺知识库测试（临时 SQLite 库）：品牌/记忆/商品/脚本片段检索、limit 生效、跨店铺不串数据。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

test("店铺知识库：按来源检索并隔离店铺", async () => {
  const { prisma, url, dbPath } = createTempDb("shop-knowledge-test");
  process.env.DATABASE_URL = url;
  try {
    const { searchShopKnowledge } = await import("@/services/shop-knowledge.service");
    const shop = await prisma.shop.create({ data: { name: "充电器专营店", market: "美国", description: "主营充电器与配件" } });
    const other = await prisma.shop.create({ data: { name: "英国美妆店", market: "英国" } });
    await prisma.memoryEntry.create({ data: { shopId: shop.id, category: "内容偏好", content: "喜欢短平快的充电器测评" } });
    const product = await prisma.product.create({ data: { shopId: shop.id, name: "卷线充电器", description: "一拉即收" } });
    await prisma.productDna.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        targetPersona: "通勤人群",
        useScenarios: "车内充电",
        coreSellingPoints: "一拉即收",
        visualHooks: "拉线回弹",
        recommendedFormats: "对比演示",
        competitorDifferences: "三合一接口",
      },
    });
    await prisma.videoScript.create({
      data: { shopId: shop.id, productId: product.id, type: "种草", duration: 10, hook: "充电器总是打结？", cta: "点击购买", shots: "[]" },
    });

    const brand = await searchShopKnowledge({ shopId: shop.id, query: "充电器", scope: "brand" });
    assert.ok(brand.snippets.some((snippet) => snippet.source === "shop" && snippet.title.includes("充电器专营店")));

    const products = await searchShopKnowledge({ shopId: shop.id, query: "充电器", scope: "products" });
    assert.ok(products.snippets.length > 0);
    assert.ok(products.snippets.every((snippet) => snippet.source === "product"));
    assert.ok(products.snippets[0].content.includes("卷线充电器"));

    const all = await searchShopKnowledge({ shopId: shop.id, query: "充电器", scope: "all", limit: 2 });
    assert.ok(all.snippets.length <= 2);
    assert.ok(all.snippets.length > 0);
    assert.ok(all.snippets.every((snippet) => snippet.score > 0));
    assert.ok(all.snippets.some((snippet) => snippet.source === "product" || snippet.source === "memory"));

    const isolated = await searchShopKnowledge({ shopId: other.id, query: "充电器", scope: "products" });
    assert.deepEqual(isolated.snippets, []);

    await assert.rejects(searchShopKnowledge({ shopId: "missing", query: "充电器", scope: "brand" }), /店铺不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
