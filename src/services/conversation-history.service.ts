// 用途：当前店铺当前对话的原文回查与检索；结果显式分页，不默默截断。
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { HistoryMessagePage, HistorySearchResult } from "@/types/context";

interface Scope { conversationId: string; shopId: string; beforeMessageId: string }
interface SearchParams extends Scope { query: string; offset?: number; limit?: number }
interface ReadParams extends Scope { messageId: string; offset?: number; limit?: number; source?: "content" | "toolCalls" }

function pageBounds(offset: number, limit: number, max: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    throw new ValidationError("分页参数无效");
  }
}

async function boundedHistoryWhere(params: Scope): Promise<Prisma.MessageWhereInput> {
  const scope = { conversationId: params.conversationId, conversation: { is: { shopId: params.shopId } } };
  const conversation = await prisma.conversation.findFirst({ where: { id: params.conversationId, shopId: params.shopId }, select: { id: true } });
  if (!conversation) throw new NotFoundError("对话不存在");
  const current = await prisma.message.findFirst({ where: { ...scope, id: params.beforeMessageId }, select: { id: true, createdAt: true } });
  if (!current) throw new NotFoundError("消息不存在");
  return { ...scope, OR: [
    { createdAt: { lt: current.createdAt } }, { createdAt: current.createdAt, id: { lt: current.id } },
  ] };
}

export async function searchConversationHistory(params: SearchParams): Promise<HistorySearchResult> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 10;
  pageBounds(offset, limit, 50);
  if (!params.query.trim() || params.query.length > 200) throw new ValidationError("搜索词须为1至200字符");
  const where = { ...await boundedHistoryWhere(params), content: { contains: params.query } };
  const [total, rows] = await prisma.$transaction([
    prisma.message.count({ where }),
    prisma.message.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: offset, take: limit }),
  ]);
  const items = rows.map((row) => {
    const matchOffset = Math.max(0, row.content.toLowerCase().indexOf(params.query.toLowerCase()));
    const start = Math.max(0, matchOffset - 80);
    return { id: row.id, role: row.role, createdAt: row.createdAt.toISOString(), matchOffset,
      snippet: row.content.slice(start, matchOffset + params.query.length + 120) };
  });
  return { items, total, offset, nextOffset: offset + items.length < total ? offset + items.length : null };
}

export async function readConversationMessage(params: ReadParams): Promise<HistoryMessagePage> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 4000;
  pageBounds(offset, limit, 16000);
  const row = await prisma.message.findFirst({ where: { ...await boundedHistoryWhere(params), id: params.messageId } });
  if (!row) throw new NotFoundError("消息不存在");
  const original = params.source === "toolCalls" ? row.toolCalls ?? "" : row.content;
  const content = original.slice(offset, offset + limit);
  return { id: row.id, role: row.role, createdAt: row.createdAt.toISOString(), content, offset,
    totalLength: original.length, nextOffset: offset + content.length < original.length ? offset + content.length : null };
}
