// 用途：店铺接口测试（直接调用 route handler，临时 SQLite 库）：市场白名单、创建、列表、编辑与归档。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../../../prisma/test-utils";

test("店铺接口：白名单、创建、编辑与归档", async () => {
  const { prisma, url, dbPath } = createTempDb("shops-route-test");
  process.env.DATABASE_URL = url;
  try {
    const { GET, POST } = await import("@/app/api/shops/route");
    const { PATCH, DELETE } = await import("@/app/api/shops/[id]/route");
    const post = (body: unknown) => POST(new Request("http://local/api/shops", { method: "POST", body: JSON.stringify(body) }));
    const patch = (id: string, body: unknown) =>
      PATCH(new Request(`http://local/api/shops/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: { id } });

    const badMarket = await post({ name: "店铺", market: "火星" });
    assert.equal(badMarket.status, 400);
    assert.equal((await post({ name: "", market: "美国" })).status, 400);

    const created = await post({ name: "测试店", market: "美国" });
    assert.equal(created.status, 201);
    const shop = (await created.json()) as { id: string };

    assert.equal((await PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ market: "火星" }) }), { params: { id: shop.id } })).status, 400);
    const renamed = await patch(shop.id, { name: "改名店" });
    assert.equal(renamed.status, 200);
    assert.equal(((await renamed.json()) as { name: string }).name, "改名店");

    const archived = await DELETE(new Request("http://local"), { params: { id: shop.id } });
    assert.equal(((await archived.json()) as { archived: boolean }).archived, true);
    assert.deepEqual(await (await GET(new Request("http://local/api/shops"))).json(), []);
    assert.equal(((await (await GET(new Request("http://local/api/shops?includeArchived=true"))).json()) as unknown[]).length, 1);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
