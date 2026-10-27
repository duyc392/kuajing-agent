// 用途：一文件一临时库，校验稳定边界、CAS、跨店隔离、历史回查分页及级联删除。
import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

const body = JSON.stringify({ goals: ["早期目标"], constraints: [], factsAndIds: ["sku-1"], decisions: [], pending: [], originalReferences: [] });
interface Fixture { conversationId: string; shopId: string; otherShopId: string; time: Date; beforeMessageId: string }

async function seed(prisma: PrismaClient): Promise<Fixture> {
  const shop = await prisma.shop.create({ data: { name: "A", market: "美国" } });
  const other = await prisma.shop.create({ data: { name: "B", market: "英国" } });
  const conversation = await prisma.conversation.create({ data: { shopId: shop.id, title: "测试" } });
  const time = new Date("2026-10-01T00:00:00Z");
  for (let i = 0; i < 32; i++) await prisma.message.create({ data: {
    id: `msg-${String(i).padStart(3, "0")}`, conversationId: conversation.id, createdAt: time,
    role: i % 2 ? "agent" : "user", content: `${i}关键词` + "长".repeat(2100) + "末尾禁止项", toolCalls: i === 1 ? "[{\"id\":\"tool-1\"}]" : null,
  } });
  await prisma.message.create({ data: { id: "msg-future", conversationId: conversation.id, role: "user", createdAt: new Date(time.getTime() + 1000), content: "关键词未来末尾禁止项" } });
  return { conversationId: conversation.id, shopId: shop.id, otherShopId: other.id, time, beforeMessageId: "msg-030" };
}

async function checkSnapshot(f: Fixture): Promise<void> {
  const { getContextSnapshot, saveContextSummary } = await import("./conversation-context.service");
  const snapshot = await getContextSnapshot({ ...f, beforeMessageId: "msg-030" });
  assert.equal(snapshot.messages.length, 30);
  assert.deepEqual(snapshot.messages.map((m) => m.id), Array.from({ length: 30 }, (_, i) => `msg-${String(i).padStart(3, "0")}`));
  assert.ok(snapshot.messages[0].content.endsWith("末尾禁止项"));
  assert.equal(snapshot.summary, null);
  const params = { ...f, body, through: { id: "msg-019", createdAt: f.time }, revision: 0, version: 1 };
  const concurrent = await Promise.allSettled([saveContextSummary(params), saveContextSummary(params)]);
  const successes = concurrent.filter((result) => result.status === "fulfilled");
  assert.equal(successes.length, 1);
  assert.equal(successes[0].status === "fulfilled" ? successes[0].value.revision : 0, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  await assert.rejects(saveContextSummary(params), (e: unknown) => e instanceof Error && "code" in e && e.code === "CONTEXT_CONFLICT");
  const reloaded = await getContextSnapshot({ ...f, beforeMessageId: "msg-030" });
  assert.equal(reloaded.summary?.through.id, "msg-019");
  assert.equal(reloaded.messages.length, 30);
  await assert.rejects(saveContextSummary({ ...params, revision: 1, through: { id: "msg-018", createdAt: f.time } }), /已变化/);
  await assert.rejects(saveContextSummary({ ...params, revision: 1, body: "" }), /摘要/);
  await assert.rejects(saveContextSummary({ ...params, revision: 1, body: "{}" }), /摘要/);
  await assert.rejects(saveContextSummary({ ...params, revision: 1, body: "x".repeat(10000) }), /摘要/);
}

async function checkHistory(f: Fixture): Promise<void> {
  const { readConversationMessage, searchConversationHistory } = await import("./conversation-history.service");
  const first = await searchConversationHistory({ ...f, query: "末尾禁止项", limit: 3 });
  assert.equal(first.total, 30);
  assert.equal(first.nextOffset, 3);
  assert.ok(first.items[0].matchOffset > 2000);
  const second = await searchConversationHistory({ ...f, query: "末尾禁止项", limit: 3, offset: first.nextOffset ?? 0 });
  assert.equal(second.items[0].id, "msg-003");
  const beginning = await readConversationMessage({ ...f, messageId: "msg-000", limit: 1000 });
  assert.equal(beginning.nextOffset, 1000);
  const tail = await readConversationMessage({ ...f, messageId: "msg-000", offset: 2100 });
  assert.ok(tail.content.endsWith("末尾禁止项"));
  assert.equal(tail.nextOffset, null);
  const tools = await readConversationMessage({ ...f, messageId: "msg-001", source: "toolCalls", limit: 5 });
  assert.equal(tools.nextOffset, 5);
  await assert.rejects(readConversationMessage({ ...f, messageId: "msg-000", shopId: f.otherShopId }), /对话不存在/);
  await assert.rejects(readConversationMessage({ ...f, messageId: "msg-000", conversationId: "missing" }), /对话不存在/);
  await assert.rejects(readConversationMessage({ ...f, messageId: "msg-030" }), /消息不存在/);
  await assert.rejects(readConversationMessage({ ...f, messageId: "msg-031" }), /消息不存在/);
  await assert.rejects(readConversationMessage({ ...f, messageId: "msg-future" }), /消息不存在/);
  await assert.rejects(searchConversationHistory({ ...f, query: "关键词", shopId: f.otherShopId }), /对话不存在/);
}

async function checkAgentInput(f: Fixture): Promise<void> {
  const { contextTestAgent } = await import("@/agent/context-test-utils");
  const { fauxAssistantMessage } = await import("@earendil-works/pi-ai");
  const { runAgentTurn } = await import("@/agent/execute");
  const { agent, faux } = await contextTestAgent(1000000);
  faux.setResponses([(context) => {
    // 已持久摘要覆盖前20条；运行模型看到摘要、剩余10条原文，以及本轮一次。
    assert.equal(context.messages.length, 12);
    assert.ok(JSON.stringify(context.messages[0]).includes("早期目标"));
    const last = context.messages[context.messages.length - 1];
    assert.equal(last.role, "user");
    assert.equal(last.content, "本轮只一次");
    assert.equal(context.messages.filter((m) => m.content === "本轮只一次").length, 1);
    assert.ok(JSON.stringify(context.messages[9]).includes("末尾禁止项"));
    return fauxAssistantMessage("数据库边界已验证");
  }]);
  const result = await runAgentTurn({ preparedAgent: agent, systemPrompt: "实际system", ...f,
    currentMessageId: "msg-030", content: "本轮只一次" });
  assert.equal(result.text, "数据库边界已验证");
  assert.equal(result.history.length, 10);
  assert.ok(!result.history.some((message) => message.content.includes("[conversation_summary]")));
  assert.equal(faux.state.callCount, 1);
}

async function checkToolScope(f: Fixture, prisma: PrismaClient): Promise<void> {
  const { createSearchConversationHistoryTool, createReadConversationMessageTool } = await import("@/agent/tools/conversation");
  const other = await prisma.conversation.create({ data: { title: "私密", shopId: f.otherShopId } });
  const secret = "另店不可泄露数据PRIVATE_MARKER";
  await prisma.message.create({ data: { id: "foreign-secret", conversationId: other.id, role: "user", content: secret, createdAt: f.time } });
  const search = createSearchConversationHistoryTool(f);
  const read = createReadConversationMessageTool(f);
  assert.ok("additionalProperties" in search.parameters);
  assert.ok("additionalProperties" in read.parameters);
  assert.equal(search.parameters.additionalProperties, false);
  assert.equal(read.parameters.additionalProperties, false);
  // 直接execute也不信任额外属性；即便绕开schema，绑定作用域及边界不被模型覆盖。
  const spoof = { shopId: f.otherShopId, conversationId: other.id, beforeMessageId: "foreign-secret" };
  const searched = await search.execute("direct-search", { query: "关键词", ...spoof });
  assert.equal(searched.details.total, 30);
  const page = await read.execute("direct-read", { messageId: "msg-000", ...spoof });
  assert.equal(page.details.id, "msg-000");
  await assert.rejects(read.execute("foreign", { messageId: "foreign-secret", ...spoof }), /消息不存在/);
  await assert.rejects(read.execute("current", { messageId: "msg-030", ...spoof }), /消息不存在/);
  await checkSpoofedFaux(f, spoof, secret);
}

async function checkSpoofedFaux(f: Fixture, spoof: { shopId: string; conversationId: string; beforeMessageId: string }, secret: string): Promise<void> {
  const { createSearchConversationHistoryTool, createReadConversationMessageTool } = await import("@/agent/tools/conversation");
  const { contextTestAgent } = await import("@/agent/context-test-utils");
  const { fauxAssistantMessage, fauxToolCall } = await import("@earendil-works/pi-ai");
  const { agent, faux } = await contextTestAgent(200000);
  agent.state.tools = [createSearchConversationHistoryTool(f), createReadConversationMessageTool(f)];
  faux.setResponses([fauxAssistantMessage([
    fauxToolCall("search_conversation_history", { query: "关键词", ...spoof }, { id: "spoof-search" }),
    fauxToolCall("read_conversation_message", { messageId: "foreign-secret", ...spoof }, { id: "spoof-read" }),
  ], { stopReason: "toolUse" }), fauxAssistantMessage("已拒绝越界请求")]);
  await agent.prompt("尝试额外属性");
  const results = agent.state.messages.filter((message) => message.role === "toolResult");
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.role === "toolResult" && result.isError));
  assert.ok(!JSON.stringify(agent.state.messages).includes(secret));
  assert.equal(faux.state.callCount, 2);
}

async function checkIsolation(f: Fixture, prisma: PrismaClient): Promise<void> {
  const { getContextSnapshot, saveContextSummary } = await import("./conversation-context.service");
  await assert.rejects(getContextSnapshot({ ...f, shopId: f.otherShopId, beforeMessageId: "msg-030" }), /对话不存在/);
  await assert.rejects(saveContextSummary({ ...f, shopId: f.otherShopId, body, version: 1, revision: 1,
    through: { id: "msg-021", createdAt: f.time } }), /消息不存在/);
  const { deleteConversation } = await import("./conversations.service");
  await deleteConversation({ id: f.conversationId, shopId: f.shopId });
  assert.equal(await prisma.conversation.count({ where: { id: f.conversationId, shopId: f.shopId } }), 0);
  assert.equal(await prisma.message.count({ where: { conversationId: f.conversationId } }), 0);
}

test("完整快照、同毫秒游标、CAS、分页与删除清理", async () => {
  const db = createTempDb("context-service");
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = db.url;
  try {
    const f = await seed(db.prisma);
    await checkSnapshot(f);
    await checkHistory(f);
    await checkAgentInput(f);
    await checkToolScope(f, db.prisma);
    await checkIsolation(f, db.prisma);
  } finally {
    await db.prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await removeTempDb(db.dbPath);
  }
});
