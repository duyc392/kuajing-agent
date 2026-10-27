// 用途：离线faux检查真实初始历史+当前一次，工具轮溢出及取消均不发额外请求。
import test from "node:test";
import assert from "node:assert/strict";
import { Type } from "typebox";
import { runAgentTurn } from "./execute";
import { generateTextOnce } from "./generate";
import { assertContextGuard, installContextGuard } from "./context-guard";
import { AppError } from "@/lib/errors";
import { contextTestAgent } from "./context-test-utils";

test("真实运行Agent收到完整历史、知识和本轮一次，工具schema已注入", async () => {
  const { fauxAssistantMessage } = await import("@earendil-works/pi-ai");
  const { agent, faux } = await contextTestAgent(200000);
  const original = "x".repeat(3000) + "近期尾部禁止项";
  let calls = 0;
  faux.setResponses([(context) => {
    calls += 1;
    assert.equal(context.systemPrompt, "实际system");
    assert.ok(context.tools?.some((tool) => tool.name === "query_shop_data"));
    assert.ok(!context.tools?.some((tool) => tool.name === "search_conversation_history"));
    const users = context.messages.filter((m) => m.role === "user");
    assert.deepEqual(users.map((m) => m.content), [original, "本轮知识", "本轮唯一提问"]);
    return fauxAssistantMessage("离线答复");
  }]);
  const result = await runAgentTurn({ preparedAgent: agent, systemPrompt: "实际system", shopId: "shop", conversationId: "conversation",
    history: [{ role: "user", content: original, createdAt: new Date(0) }], postHistoryContext: "本轮知识", content: "本轮唯一提问" });
  assert.equal(result.text, "离线答复");
  assert.equal(calls, 1);
  assert.equal(result.history[0].content, original);
});

test("预先aborted的execute和generate直接拒绝，不调用离线流", async () => {
  const { fauxAssistantMessage } = await import("@earendil-works/pi-ai");
  const { agent, faux } = await contextTestAgent(200000);
  const signal = AbortSignal.abort();
  const isAborted = (error: unknown) => error instanceof AppError && error.code === "REQUEST_ABORTED";
  await assert.rejects(runAgentTurn({ preparedAgent: agent, systemPrompt: "", shopId: "s", content: "取消", signal }), isAborted);
  await assert.rejects(generateTextOnce({ agent, systemPrompt: "", userPrompt: "取消", signal }), isAborted);
  assert.equal(faux.state.callCount, 0);
});

test("工具原始大结果完整保留，下一轮在provider前CONTEXT_LIMIT，不拆配对", async () => {
  const { fauxAssistantMessage, fauxToolCall } = await import("@earendil-works/pi-ai");
  const { agent, faux } = await contextTestAgent(12000);
  const huge = "原始工具数据".repeat(3000);
  agent.state.tools = [{ name: "large", label: "测试工具", description: "离线大结果", parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: "text", text: huge }], details: { original: huge } }) }];
  installContextGuard(agent);
  faux.setResponses([fauxAssistantMessage([fauxToolCall("large", {}, { id: "large-1" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("不应调用")]);
  await agent.prompt("运行离线工具");
  assert.throws(() => assertContextGuard(agent), (error: unknown) => error instanceof AppError && error.code === "CONTEXT_LIMIT");
  assert.equal(faux.state.callCount, 1);
  const toolResult = agent.state.messages.find((m) => m.role === "toolResult");
  assert.ok(toolResult && "content" in toolResult && Array.isArray(toolResult.content));
  assert.ok(JSON.stringify(toolResult).includes(huge));
});
