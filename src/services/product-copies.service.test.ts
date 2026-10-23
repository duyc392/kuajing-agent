// 用途：文案版本服务测试（临时 SQLite 库）：版本递增、唯一当前版本、切换当前、跨店铺 404。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

const INPUT = { title: "标题", description: "描述", sellingPoints: "卖点", language: "en", source: "ai" as const };

test("文案版本：递增、唯一当前、切换与店铺隔离", async () => {
  const { prisma, url, dbPath } = createTempDb("copies-test");
  process.env.DATABASE_URL = url;
  try {
    const { createCopy, listCopies, setCurrentCopy } = await import("@/services/product-copies.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });
    const product = await prisma.product.create({ data: { shopId: shop.id, name: "充电器" } });

    const v1 = await createCopy({ productId: product.id, shopId: shop.id, ...INPUT });
    assert.equal(v1.version, 1);
    assert.equal(v1.isCurrent, true);

    const v2 = await createCopy({ productId: product.id, shopId: shop.id, ...INPUT, title: "第二版" });
    assert.equal(v2.version, 2);
    assert.equal(v2.isCurrent, true);
    assert.equal((await prisma.productCopy.findUnique({ where: { id: v1.id } }))?.isCurrent, false);

    const versions = await listCopies(product.id, shop.id);
    assert.deepEqual(versions.map((row) => row.version), [2, 1]);

    const switched = await setCurrentCopy({ productId: product.id, copyId: v1.id, shopId: shop.id });
    assert.equal(switched.isCurrent, true);
    assert.equal((await prisma.productCopy.findUnique({ where: { id: v2.id } }))?.isCurrent, false);

    await assert.rejects(setCurrentCopy({ productId: product.id, copyId: v1.id, shopId: other.id }), /商品不存在/);
    await assert.rejects(setCurrentCopy({ productId: product.id, copyId: "missing", shopId: shop.id }), /文案版本不存在/);
    await assert.rejects(createCopy({ productId: product.id, shopId: other.id, ...INPUT }), /商品不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
