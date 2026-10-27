// 用途：结构化摘要的纯校验；无效输出不允许更新覆盖游标。
import { estimateContextTokens } from "@/lib/conversation-context";
import { ValidationError } from "@/lib/errors";
import type { StructuredConversationSummary } from "@/types/context";

export const SUMMARY_VERSION = 1;
export const SUMMARY_FIELDS: Array<keyof StructuredConversationSummary> = [
  "goals", "constraints", "factsAndIds", "decisions", "pending", "originalReferences",
];

export function validateContextSummary(body: string, tokenLimit: number): string {
  if (!body.trim() || estimateContextTokens(body) > tokenLimit) throw new ValidationError("上下文摘要为空或超出预算");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new ValidationError("上下文摘要格式无效"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ValidationError("上下文摘要格式无效");
  const record = parsed as Record<string, unknown>;
  const valid = SUMMARY_FIELDS.every((field) => Array.isArray(record[field])
    && (record[field] as unknown[]).every((value) => typeof value === "string" && value.trim() !== ""));
  if (!valid || !SUMMARY_FIELDS.some((field) => (record[field] as unknown[]).length > 0)) {
    throw new ValidationError("上下文摘要缺少关键结构或有效内容");
  }
  return body.trim();
}
