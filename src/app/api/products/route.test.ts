// 用途：商品接口测试（直接调用 route handler，临时 SQLite 库）：shopId 必填、入参校验、创建与列表、未知店铺 404。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../../../prisma/test-utils";

test("商品接口：校验、创建、列表与错误码", async () => {
  const { prisma, url, dbPath } = createTempDb("products-route-test");
  process.env.DATABASE_URL = url;
  try {
    const { GET, POST } = await import("@/app/api/products/route");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const get = (search: string) => GET(new Request(`http://local/api/products${search}`));
    const post = (search: string, body: unknown) =>
      POST(new Request(`http://local/api/products${search}`, { method: "POST", body: JSON.stringify(body) }));

    const missingShop = await get("");
    assert.equal(missingShop.status, 400);
    assert.equal(((await missingShop.json()) as { code: string }).code, "VALIDATION_ERROR");

    assert.equal((await get("?shopId=missing")).status, 404);
    assert.equal((await post(`?shopId=${shop.id}`, { price: 10 })).status, 400);
    assert.equal((await post(`?shopId=${shop.id}`, { name: "充电器", price: -1 })).status, 400);
    assert.equal((await post("?shopId=missing", { name: "充电器" })).status, 404);

    const created = await post(`?shopId=${shop.id}`, { name: "充电器", category: "3C", price: 24.99 });
    assert.equal(created.status, 201);
    assert.equal(((await created.json()) as { name: string }).name, "充电器");

    const listed = await get(`?shopId=${shop.id}`);
    assert.equal(listed.status, 200);
    assert.equal(((await listed.json()) as unknown[]).length, 1);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
