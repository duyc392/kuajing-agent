import test from "node:test";
import assert from "node:assert/strict";
import { ChatStreamError, streamChatRequest } from "./api-stream";
import type { ChatStreamEvent } from "@/types";

const budget = { connectionMs: 30, idleMs: 30 };
const message = { id: "u", role: "user" as const, content: "原文", createdAt: "2026-10-27" };
function sse(events: ChatStreamEvent[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
}
async function withFetch(run: () => Promise<void>, replacement: typeof fetch): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("聊天连接等待独立超时，不重发 POST", async () => {
  let calls = 0;
  await withFetch(async () => {
    await assert.rejects(streamChatRequest("/chat", {}, () => undefined, undefined, budget), /连接等待超时/);
    assert.equal(calls, 1);
  }, async () => { calls++; return new Promise<Response>(() => undefined); });
});

test("流空闲超时取消 reader，不重复 POST", async () => {
  let cancelled = false;
  await withFetch(async () => {
    await assert.rejects(streamChatRequest("/chat", {}, () => undefined, undefined, budget), /长时间无响应/);
    assert.equal(cancelled, true);
  }, async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
});

test("业务 error 不能当成功，user 确认仍向上传递", async () => {
  const received: ChatStreamEvent[] = [];
  await withFetch(async () => {
    await assert.rejects(streamChatRequest("/chat", {}, (event) => received.push(event)), /业务失败/);
    assert.deepEqual(received.map((event) => event.type), ["user", "error"]);
  }, async () => sse([{ type: "user", message }, { type: "error", error: "业务失败" }]));
});

test("done 立即结束，不等待服务端关闭连接", async () => {
  await withFetch(async () => {
    await streamChatRequest("/chat", {}, () => undefined, undefined, budget);
  }, async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", agentMessage: message })}\n\n`));
  } })));
});

test("半帧、坏 JSON、缺少终止帧都报错", async () => {
  for (const text of ["data: {bad}\n\n", "data: {", `data: ${JSON.stringify({ type: "user", message })}\n\n`]) {
    await withFetch(async () => {
      await assert.rejects(streamChatRequest("/chat", {}, () => undefined), ChatStreamError);
    }, async () => new Response(text));
  }
});

test("取消连接及读取立即退出，预取消不发 POST", async () => {
  const controller = new AbortController();
  let calls = 0;
  await withFetch(async () => {
    const request = streamChatRequest("/chat", {}, () => undefined, controller.signal);
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    await assert.rejects(streamChatRequest("/chat", {}, () => undefined, controller.signal), { name: "AbortError" });
    assert.equal(calls, 1);
  }, async () => { calls++; return new Promise<Response>(() => undefined); });
  const reading = new AbortController();
  await withFetch(async () => {
    const request = streamChatRequest("/chat", {}, () => undefined, reading.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    reading.abort();
    await assert.rejects(request, { name: "AbortError" });
  }, async () => new Response(new ReadableStream()));
});

test("明确 4xx 拒绝可恢复原文，5xx 送达不确定", async () => {
  for (const status of [400, 429, 500]) {
    await withFetch(async () => {
      await assert.rejects(streamChatRequest("/chat", {}, () => undefined), (error: unknown) => {
        assert.ok(error instanceof ChatStreamError);
        assert.equal(error.delivery, status < 500 ? "rejected" : "uncertain");
        return true;
      });
    }, async () => Response.json({ error: "失败" }, { status }));
  }
});
