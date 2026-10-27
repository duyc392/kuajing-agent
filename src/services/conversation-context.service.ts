// 用途：上下文快照和摘要CAS持久化；仅数据库IO，不调用模型，原文永不因压缩删除。
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { validateContextSummary, SUMMARY_VERSION } from "@/lib/context-summary";
import { readContextSettings } from "@/config/context";
import type { ContextMessage, ContextSnapshot, PersistedContextSummary, MessageCursor } from "@/types/context";

interface ConversationScope { conversationId: string; shopId: string }
interface SnapshotParams extends ConversationScope { beforeMessageId: string }
interface SaveSummaryParams extends ConversationScope {
  revision: number;
  body: string;
  through: MessageCursor;
  version: number;
}

function beforeCursor(cursor: MessageCursor): Prisma.MessageWhereInput {
  return { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
}

function readSummary(row: {
  contextSummary: string | null; summaryThroughMessageId: string | null; summaryThroughAt: Date | null;
  summaryRevision: number; summaryVersion: number | null;
}): PersistedContextSummary | null {
  if (!row.contextSummary || !row.summaryThroughMessageId || !row.summaryThroughAt) return null;
  return { body: row.contextSummary, through: { id: row.summaryThroughMessageId, createdAt: row.summaryThroughAt },
    revision: row.summaryRevision, version: row.summaryVersion ?? 1 };
}

export async function getContextSnapshot(params: SnapshotParams): Promise<ContextSnapshot> {
  const where = { id: params.conversationId, shopId: params.shopId };
  const conversation = await prisma.conversation.findFirst({ where });
  if (!conversation) throw new NotFoundError("对话不存在");
  const current = await prisma.message.findFirst({
    where: { id: params.beforeMessageId, conversationId: params.conversationId, conversation: { is: { shopId: params.shopId } } },
  });
  if (!current) throw new NotFoundError("消息不存在");
  // 不设置take：旧对话第一次压缩也必须看到全部前缀；同毫秒用id稳定排序，不用时间单独作边界。
  const rows = await prisma.message.findMany({
    where: { conversationId: params.conversationId, conversation: { is: { shopId: params.shopId } }, ...beforeCursor(current) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const messages: ContextMessage[] = rows.map((row) => ({
    id: row.id, role: row.role === "user" ? "user" : "agent", content: row.content,
    createdAt: row.createdAt, toolCalls: row.toolCalls,
  }));
  return { messages, summary: readSummary(conversation), revision: conversation.summaryRevision };
}

export async function saveContextSummary(params: SaveSummaryParams): Promise<PersistedContextSummary> {
  validateContextSummary(params.body, readContextSettings().summaryTokens);
  if (params.version !== SUMMARY_VERSION) throw new ValidationError("摘要版本无效");
  const through = await prisma.message.findFirst({ where: {
    id: params.through.id, createdAt: params.through.createdAt, conversationId: params.conversationId,
    conversation: { is: { shopId: params.shopId } },
  } });
  if (!through) throw new NotFoundError("消息不存在");
  const updated = await prisma.conversation.updateMany({
    where: { id: params.conversationId, shopId: params.shopId, summaryRevision: params.revision, OR: [
      { summaryThroughAt: null }, { summaryThroughAt: { lt: through.createdAt } },
      { summaryThroughAt: through.createdAt, summaryThroughMessageId: { lt: through.id } },
    ] },
    data: { contextSummary: params.body, summaryThroughMessageId: through.id, summaryThroughAt: through.createdAt,
      summaryVersion: params.version, summaryRevision: { increment: 1 } },
  });
  if (updated.count !== 1) throw new AppError("对话上下文已变化，请重试", "CONTEXT_CONFLICT", 409);
  return { body: params.body, through: params.through, version: params.version, revision: params.revision + 1 };
}
