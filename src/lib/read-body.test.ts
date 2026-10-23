// 用途：请求体读取单测：正常 JSON、空 body、非法 JSON、超限 413 与读取超时 408。
import test from "node:test";
import assert from "node:assert/strict";
import { AppError, ValidationError } from "@/lib/errors";
import { readJsonBody } from "@/lib/read-body";

function post(body: BodyInit | null): Request {
  return new Request("http://local/api", { method: "POST", body });
}

test("正常 JSON 解析为对象", async () => {
  assert.deepEqual(await readJsonBody(post(JSON.stringify({ a: 1 }))), { a: 1 });
});

test("没有 body 时返回空对象", async () => {
  assert.deepEqual(await readJsonBody(new Request("http://local/api", { method: "POST" })), {});
});

test("非法 JSON 抛 ValidationError", async () => {
  await assert.rejects(readJsonBody(post("{broken")), ValidationError);
});

test("超过字节上限抛 413 BODY_TOO_LARGE", async () => {
  await assert.rejects(
    readJsonBody(post("a".repeat(20)), 10),
    (error: unknown) => error instanceof AppError && error.code === "BODY_TOO_LARGE" && error.statusCode === 413,
  );
});

test("读取超时抛 408 BODY_TIMEOUT", async () => {
  const neverEnding = new ReadableStream<Uint8Array>({ start() {} });
  const request = new Request("http://local/api", {
    method: "POST",
    body: neverEnding,
    duplex: "half",
  } as unknown as RequestInit);
  await assert.rejects(
    readJsonBody(request, 1024, 10),
    (error: unknown) => error instanceof AppError && error.code === "BODY_TIMEOUT" && error.statusCode === 408,
  );
});
