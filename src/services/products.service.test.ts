// 用途：商品服务测试（临时 SQLite 库）：列表摘要计数、DNA 状态、非法测品状态降级、跨店铺 404、编辑与删除级联。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

test("商品：列表摘要、店铺隔离、编辑与删除级联", async () => {
  const { prisma, url, dbPath } = createTempDb("products-test");
  process.env.DATABASE_URL = url;
  try {
    const { createProduct, deleteProduct, getProduct, listProducts, updateProduct } = await import("@/services/products.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });

    const product = await createProduct(shop.id, { name: "自动卷线充电器", category: "3C数码", price: 24.99 });
    const [summary] = await listProducts(shop.id);
    assert.equal(summary.id, product.id);
    assert.equal(summary.variantCount, 0);
    assert.equal(summary.copyCount, 0);
    assert.equal(summary.dnaBuilt, false);
    assert.equal(summary.testingStatus, null);

    await prisma.productVariant.create({ data: { productId: product.id, sku: "SKU-1" } });
    await prisma.productCopy.create({
      data: { productId: product.id, shopId: shop.id, title: "标题", description: "描述", language: "en", version: 1, source: "ai", isCurrent: true },
    });
    await prisma.productDna.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        targetPersona: "画像",
        useScenarios: "场景",
        coreSellingPoints: "卖点",
        visualHooks: "钩子",
        recommendedFormats: "形式",
        competitorDifferences: "差异",
      },
    });
    await prisma.product.update({ where: { id: product.id }, data: { testingStatus: "testing" } });
    const [withRelations] = await listProducts(shop.id);
    assert.equal(withRelations.variantCount, 1);
    assert.equal(withRelations.copyCount, 1);
    assert.equal(withRelations.dnaBuilt, true);
    assert.equal(withRelations.testingStatus, "testing");

    await prisma.product.update({ where: { id: product.id }, data: { testingStatus: "测试中" } });
    assert.equal((await listProducts(shop.id))[0].testingStatus, null, "非法状态按 null 处理");

    await assert.rejects(getProduct({ id: product.id, shopId: other.id }), /商品不存在/);
    await assert.rejects(deleteProduct({ id: product.id, shopId: other.id }), /商品不存在/);

    assert.equal((await updateProduct({ id: product.id, shopId: shop.id }, { name: "改名商品" })).name, "改名商品");
    await deleteProduct({ id: product.id, shopId: shop.id });
    assert.equal(await prisma.productVariant.count({ where: { productId: product.id } }), 0);
    assert.equal(await prisma.productCopy.count({ where: { productId: product.id } }), 0);
    assert.equal(await prisma.productDna.count({ where: { productId: product.id } }), 0);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
