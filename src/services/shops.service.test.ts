// 用途：店铺服务测试（临时 SQLite 库）：创建、列表商品数、空输入不改、改名、归档后默认隐藏、未知店铺 404。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

test("店铺：创建/列表/编辑/归档与 404", async () => {
  const { prisma, url, dbPath } = createTempDb("shops-test");
  process.env.DATABASE_URL = url;
  try {
    const { archiveShop, createShop, getShop, listShops, updateShop } = await import("@/services/shops.service");

    const shop = await createShop({ name: "测试店", market: "美国", description: "简介" });
    assert.equal(shop.name, "测试店");
    assert.equal(shop.market, "美国");
    assert.equal(shop.archived, false);

    const listed = await listShops();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].productCount, 0);

    await prisma.product.create({ data: { shopId: shop.id, name: "充电器" } });
    assert.equal((await listShops())[0].productCount, 1);

    assert.equal((await updateShop(shop.id, {})).name, "测试店");
    assert.equal((await updateShop(shop.id, { name: "改名店" })).name, "改名店");

    await archiveShop(shop.id);
    assert.equal((await getShop(shop.id)).archived, true);
    assert.equal((await listShops()).length, 0);
    assert.equal((await listShops(true)).length, 1);

    await assert.rejects(getShop("missing"), /店铺不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
