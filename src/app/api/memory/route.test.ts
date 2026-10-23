// 用途：记忆接口测试（直接调用 route handler，临时 SQLite 库）：shopId 必填、未知店铺 404、按店铺返回记忆。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../../../prisma/test-utils";

test("记忆接口：shopId 隔离与列表", async () => {
  const { prisma, url, dbPath } = createTempDb("memory-route-test");
  process.env.DATABASE_URL = url;
  try {
    const { GET } = await import("@/app/api/memory/route");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });
    await prisma.memoryEntry.create({ data: { shopId: shop.id, category: "店铺定位", content: "专注 3C 配件" } });
    await prisma.memoryEntry.create({ data: { shopId: other.id, category: "店铺定位", content: "别家记忆" } });

    assert.equal((await GET(new Request("http://local/api/memory"))).status, 400);
    assert.equal((await GET(new Request("http://local/api/memory?shopId=missing"))).status, 404);

    const response = await GET(new Request(`http://local/api/memory?shopId=${shop.id}`));
    const rows = (await response.json()) as Array<{ content: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].content, "专注 3C 配件");
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
