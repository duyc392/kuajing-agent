// 用途：API 路由统一错误转换：AppError 转为对应状态码的 JSON 响应，zod 校验失败转为 400，未知错误统一 500 中文提示。
import { ZodError } from "zod";
import { AppError } from "./errors";

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0]?.message ?? "参数不合法";
    return Response.json({ error: `参数不合法：${first}`, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  console.error("API 未知错误：", error);
  return Response.json({ error: "服务器内部错误", code: "INTERNAL_ERROR" }, { status: 500 });
}
