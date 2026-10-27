// 用途：摘要模型依赖注入，长文每个分段全覆盖，输出失败不返回有效摘要。
import test from "node:test";
import assert from "node:assert/strict";
import { compactConversationMessages } from "./context-compaction";
import { contextTestMessages, contextTestSummary, TEST_CONTEXT_SETTINGS } from "./context-test-utils";

function capturedRaw(prompt: string): string {
  const section = prompt.split("<conversation_data>\n")[1]?.split("\n</conversation_data>")[0] ?? "";
  return section;
}

test("长消息摘要输入分批，不重复不漏尾部，不拆UTF16；每批滚动合并上一摘要", async () => {
  const messages = contextTestMessages(2);
  messages[0].content = "ABCDEFGHIJ".repeat(5000) + "😀末尾禁止项";
  messages[1].content = "末段回复";
  const prompts: string[] = [];
  const summary = contextTestSummary();
  const result = await compactConversationMessages({ messages, previous: "", settings: TEST_CONTEXT_SETTINGS,
    runtime: { model: { contextWindow: 7000, maxTokens: 512 }, summarize: async ({ userPrompt }) => {
      prompts.push(userPrompt);
      return summary;
    } } });
  assert.equal(result, summary);
  assert.ok(prompts.length > 10);
  assert.ok(prompts.every((prompt) => prompt.includes("完整JSON的UTF-8总长度不超过337字节")));
  assert.ok(prompts.every((prompt) => prompt.includes("字段名、括号、引号和正文全部计入")));
  const parts = prompts.flatMap((prompt) => [...capturedRaw(prompt).matchAll(/消息id=m000 role=user 日期=\S+ offset=(\d+)\n([\s\S]*?)(?=\n\n消息id=|$)/g)]);
  assert.equal(parts.map((part) => part[2].replace(/\n$/, "")).join(""), messages[0].content);
  let offset = 0;
  for (const part of parts) {
    assert.equal(Number(part[1]), offset);
    offset += part[2].replace(/\n$/, "").length;
  }
  assert.ok(prompts.slice(1).every((prompt) => prompt.includes("早期目标SKU-1")));
  assert.ok(capturedRaw(prompts[prompts.length - 1]).includes("末段回复"));
});

test("摘要空、结构错误、超预算、模型异常均失败", async () => {
  for (const output of ["", "{}", "not-json", contextTestSummary("x".repeat(2000))]) {
    await assert.rejects(compactConversationMessages({ messages: contextTestMessages(2), previous: "",
      settings: TEST_CONTEXT_SETTINGS, runtime: { model: { contextWindow: 7000, maxTokens: 512 }, summarize: async () => output } }), /摘要/);
  }
  await assert.rejects(compactConversationMessages({ messages: contextTestMessages(2), previous: "",
    settings: TEST_CONTEXT_SETTINGS, runtime: { model: { contextWindow: 7000, maxTokens: 512 }, summarize: async () => { throw new Error("离线失败"); } } }), /离线失败/);
});
