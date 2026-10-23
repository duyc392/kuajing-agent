// 用途：商品变体服务测试（临时 SQLite 库）：SKU 唯一、价格/库存范围、部分更新、跨店铺 404 与删除。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

test("变体：创建、唯一约束、范围校验、部分更新与店铺隔离", async () => {
  const { prisma, url, dbPath } = createTempDb("variants-test");
  process.env.DATABASE_URL = url;
  try {
    const { createVariant, deleteVariant, listVariants, updateVariant } = await import("@/services/variants.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });
    const product = await prisma.product.create({ data: { shopId: shop.id, name: "充电器" } });
    const otherProduct = await prisma.product.create({ data: { shopId: other.id, name: "别家商品" } });

    const first = await createVariant(product.id, shop.id, { sku: "SKU-1", color: "黑色", size: "M", price: 19.9, stock: 10 });
    assert.equal(first.sku, "SKU-1");

    await assert.rejects(createVariant(product.id, shop.id, { sku: "SKU-1" }), /SKU 已存在/);
    await assert.rejects(createVariant(product.id, shop.id, { sku: "SKU-2", price: -1 }), /价格必须是/);
    await assert.rejects(createVariant(product.id, shop.id, { sku: "SKU-3", stock: 1.5 }), /库存必须是/);

    const second = await createVariant(product.id, shop.id, { sku: "SKU-2" });
    assert.equal((await listVariants(product.id, shop.id)).length, 2);

    const updated = await updateVariant(
      { productId: product.id, variantId: first.id, shopId: shop.id },
      { stock: 5, color: null },
    );
    assert.equal(updated.stock, 5);
    assert.equal(updated.color, null);
    assert.equal(updated.size, "M", "未提交字段保持原值");

    await assert.rejects(listVariants(product.id, other.id), /商品不存在/);
    await assert.rejects(updateVariant({ productId: product.id, variantId: first.id, shopId: other.id }, { stock: 1 }), /商品不存在/);
    await assert.rejects(updateVariant({ productId: product.id, variantId: "missing", shopId: shop.id }, { stock: 1 }), /变体不存在/);

    await createVariant(otherProduct.id, other.id, { sku: "SKU-1" });
    await deleteVariant({ productId: product.id, variantId: second.id, shopId: shop.id });
    assert.equal((await listVariants(product.id, shop.id)).length, 1);
    await assert.rejects(updateVariant({ productId: product.id, variantId: second.id, shopId: shop.id }, { stock: 1 }), /变体不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
