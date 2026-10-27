// 用途：消息服务测试（临时 SQLite 库）：首条消息自动命名、历史读取、工具记录解析、提议状态更新与店铺隔离。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import type { ToolCallRecord } from "@/types";

const TOOL_CALL: ToolCallRecord = {
  id: "call-1",
  toolName: "propose_skill",
  label: "沉淀技能",
  args: {},
  status: "done",
  proposalState: "pending",
};

test("消息：自动命名、序列化工具记录、历史与归属校验", async () => {
  const { prisma, url, dbPath } = createTempDb("messages-test");
  process.env.DATABASE_URL = url;
  try {
    const { recordAgentMessage, recordUserMessage, listMessages, updateMessageToolCall } = await import("@/services/messages.service");
    const { createConversation } = await import("@/services/conversations.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });
    const conversation = await createConversation({ shopId: shop.id });

    const user = await recordUserMessage({ conversationId: conversation.id, shopId: shop.id, content: "  帮我写一个\n充电器脚本  " });
    assert.equal(user.role, "user");
    assert.equal((await prisma.conversation.findUnique({ where: { id: conversation.id } }))?.title, "帮我写一个 充电器脚本");

    const agent = await recordAgentMessage({ conversationId: conversation.id, shopId: shop.id, content: "好的", toolCalls: [TOOL_CALL] });
    assert.equal(agent.toolCalls?.[0].toolName, "propose_skill");

    const messages = await listMessages(conversation.id, shop.id);
    assert.deepEqual(messages.map((message) => message.role), ["user", "agent"]);
    assert.equal(messages[1].toolCalls?.[0].proposalState, "pending");

    const { getContextSnapshot } = await import("@/services/conversation-context.service");
    const current = await recordUserMessage({ conversationId: conversation.id, shopId: shop.id, content: "继续" });
    const history = await getContextSnapshot({ conversationId: conversation.id, shopId: shop.id, beforeMessageId: current.id });
    assert.equal(history.messages.length, 2);
    assert.equal(history.summary, null);
    assert.equal(history.messages[1].content, "好的");
    assert.ok(history.messages[1].toolCalls?.includes("propose_skill"));

    const updated = await updateMessageToolCall({ messageId: agent.id, shopId: shop.id, toolCallId: "call-1", proposalState: "confirmed", skillId: "skill-1" });
    assert.equal(updated.toolCalls?.[0].proposalState, "confirmed");
    assert.equal(updated.toolCalls?.[0].skillId, "skill-1");

    await assert.rejects(updateMessageToolCall({ messageId: agent.id, shopId: other.id, toolCallId: "call-1", proposalState: "ignored" }), /消息不存在/);
    await assert.rejects(updateMessageToolCall({ messageId: agent.id, shopId: shop.id, toolCallId: "missing", proposalState: "ignored" }), /工具调用记录不存在/);
    await assert.rejects(listMessages(conversation.id, other.id), /对话不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
