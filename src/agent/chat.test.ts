// 用途：已取消的回合不占模型名额或读取业务数据，错误后锁由finally释放。
import test from "node:test";
import assert from "node:assert/strict";
import { runAgentReplyEvents } from "./chat";

test("回合预取消在acquireTurnSlot即拒绝，不访问模型/业务库", async () => {
  const params = { conversationId: "missing-conversation", shopId: "missing-shop", content: "不发请求",
    userMessage: { id: "missing-message", role: "user" as const, content: "不发请求", createdAt: new Date().toISOString() },
    signal: AbortSignal.abort() };
  const events = [];
  for await (const event of runAgentReplyEvents(params)) events.push(event);
  assert.deepEqual(events, [{ type: "error", error: "请求已取消" }]);
  const next = [];
  for await (const event of runAgentReplyEvents(params)) next.push(event);
  assert.deepEqual(next, events);
});
