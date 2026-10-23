// 用途：API 错误转换单测：AppError 状态码、zod 首个错误转 400、未知错误统一 500 且不泄露细节。
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { AppError, NotFoundError } from "@/lib/errors";

test("AppError 保留状态码、code 与中文消息", async () => {
  const response = toErrorResponse(new AppError("参数不合法", "BAD_INPUT", 422));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "参数不合法", code: "BAD_INPUT" });
});

test("NotFoundError 转 404", async () => {
  const response = toErrorResponse(new NotFoundError("商品不存在"));
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { code: string }).code, "NOT_FOUND");
});

test("ZodError 取首个 issue 转 400", async () => {
  const parsed = z.object({ name: z.string().min(1, "名称不能为空") }).safeParse({ name: "" });
  assert.equal(parsed.success, false);
  const response = toErrorResponse(parsed.error);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "参数不合法：名称不能为空", code: "VALIDATION_ERROR" });
});

test("未知错误转 500 且不泄露原始信息", async () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    const response = toErrorResponse(new Error("数据库密码是 secret"));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "服务器内部错误", code: "INTERNAL_ERROR" });
  } finally {
    console.error = original;
  }
});
