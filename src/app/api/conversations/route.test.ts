// 用途：对话接口测试（直接调用 route handler，临时 SQLite 库）：shopId 必填、未知店铺 404、创建与列表。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../../../prisma/test-utils";
import type { PrismaClient } from "@prisma/client";

async function verifyHistoryRoute(prisma: PrismaClient, shopId: string): Promise<void> {
  const { GET } = await import("@/app/api/conversations/[id]/route");
  const other = await prisma.shop.create({ data: { name: "隔离店铺", market: "美国" } });
  const conversation = await prisma.conversation.create({ data: { shopId, title: "历史" } });
  await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: "轻量历史" } });
  const get = (id: string, search: string) => GET(new Request(`http://local/api/conversations/${id}${search}`), { params: { id } });
  assert.equal((await get(conversation.id, "")).status, 400);
  assert.equal((await get(conversation.id, `?shopId=${"x".repeat(129)}`)).status, 400);
  assert.equal((await get("", `?shopId=${shopId}`)).status, 400);
  assert.equal((await get("missing", `?shopId=${shopId}`)).status, 404);
  assert.equal((await get(conversation.id, `?shopId=${other.id}`)).status, 404);
  const response = await get(conversation.id, `?shopId=${shopId}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const messages = await response.json() as { content: string }[];
  assert.deepEqual(messages.map((message) => message.content), ["轻量历史"]);
}

test("对话接口：校验、创建与列表", async () => {
  const { prisma, url, dbPath } = createTempDb("conversations-route-test");
  process.env.DATABASE_URL = url;
  try {
    const { GET, POST } = await import("@/app/api/conversations/route");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const get = (search: string) => GET(new Request(`http://local/api/conversations${search}`));
    const post = (body: unknown) => POST(new Request("http://local/api/conversations", { method: "POST", body: JSON.stringify(body) }));

    assert.equal((await get("")).status, 400);
    assert.equal((await get("?shopId=missing")).status, 404);
    assert.equal((await post({ title: "缺少店铺" })).status, 400);
    assert.equal((await post({ shopId: "missing" })).status, 404);

    const created = await post({ shopId: shop.id, title: "选品讨论" });
    assert.equal(created.status, 201);
    const listed = await get(`?shopId=${shop.id}`);
    assert.equal(((await listed.json()) as unknown[]).length, 1);
    await verifyHistoryRoute(prisma, shop.id);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
