// 用途：前端请求封装单测：JSON 解析、错误消息透传、异常响应、超时与主动取消；用假 fetch，不发真实请求。
import test from "node:test";
import assert from "node:assert/strict";
import { apiRequest } from "@/lib/api-client";

async function withFetch<T>(mock: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("apiRequest：成功返回 JSON 并带上方法、请求体与 Content-Type", async () => {
  let captured: RequestInit | undefined;
  const mock = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return Response.json({ ok: true });
  }) as typeof fetch;

  const data = await withFetch(mock, () => apiRequest<{ ok: boolean }>("POST", "/api/demo", { a: 1 }));
  assert.deepEqual(data, { ok: true });
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.body, JSON.stringify({ a: 1 }));
  assert.equal(new Headers(captured?.headers).get("Content-Type"), "application/json");
});

test("apiRequest：非 2xx 透传服务端中文错误", async () => {
  const mock = (async () => Response.json({ error: "商品不存在" }, { status: 404 })) as typeof fetch;
  await withFetch(mock, async () => {
    await assert.rejects(apiRequest("GET", "/api/products"), /商品不存在/);
  });
});

test("apiRequest：2xx 非 JSON 响应报异常，不返回空对象", async () => {
  const mock = (async () => new Response("not-json", { status: 200 })) as typeof fetch;
  await withFetch(mock, async () => {
    await assert.rejects(apiRequest("GET", "/api/demo"), /服务响应异常/);
  });
});

test("apiRequest：超时报中文提示", async () => {
  const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch;
  await withFetch(hanging, async () => {
    await assert.rejects(apiRequest("GET", "/api/slow", undefined, undefined, 10), /请求超时/);
  });
});

test("apiRequest：调用方主动取消时原样抛出 AbortError", async () => {
  const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch;
  const controller = new AbortController();
  await withFetch(hanging, async () => {
    const pending = apiRequest("GET", "/api/slow", undefined, controller.signal, 10_000);
    controller.abort();
    const error = await pending.catch((reason: unknown) => reason);
    assert.equal((error as Error).name, "AbortError");
  });
});
