// 用途：对话服务测试（临时 SQLite 库）：默认标题、按更新时间倒序、跨店铺 404、店铺不存在拒绝、删除级联清空消息。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import { DEFAULT_CONVERSATION_TITLE } from "@/types";

test("对话：默认标题、排序、店铺隔离与删除级联", async () => {
  const { prisma, url, dbPath } = createTempDb("conversations-test");
  process.env.DATABASE_URL = url;
  try {
    const { createConversation, deleteConversation, getConversation, listConversations } = await import("@/services/conversations.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });

    const first = await createConversation({ shopId: shop.id });
    assert.equal(first.title, DEFAULT_CONVERSATION_TITLE);
    const second = await createConversation({ shopId: shop.id, title: "自定义标题" });
    assert.equal(second.title, "自定义标题");

    await prisma.conversation.update({ where: { id: first.id }, data: { updatedAt: new Date("2026-02-01T00:00:00.000Z") } });
    await prisma.conversation.update({ where: { id: second.id }, data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") } });
    const listed = await listConversations(shop.id);
    assert.deepEqual(listed.map((row) => row.id), [first.id, second.id]);

    await assert.rejects(getConversation({ id: first.id, shopId: other.id }), /对话不存在/);
    await assert.rejects(createConversation({ shopId: "missing" }), /店铺不存在/);

    await prisma.message.create({ data: { conversationId: first.id, role: "user", content: "你好" } });
    await prisma.message.create({ data: { conversationId: first.id, role: "agent", content: "回复" } });
    await assert.rejects(deleteConversation({ id: first.id, shopId: other.id }), /对话不存在/);
    assert.notEqual(await prisma.conversation.findFirst({ where: { id: first.id } }), null);

    await deleteConversation({ id: first.id, shopId: shop.id });
    assert.equal(await prisma.conversation.findFirst({ where: { id: first.id } }), null);
    assert.equal(await prisma.message.count({ where: { conversationId: first.id } }), 0);
    assert.deepEqual(await listConversations(shop.id).then((rows) => rows.map((row) => row.id)), [second.id]);
    await assert.rejects(deleteConversation({ id: first.id, shopId: shop.id }), /对话不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
