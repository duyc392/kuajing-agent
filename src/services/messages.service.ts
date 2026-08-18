// 用途：消息持久化（不含 Agent 调用）：按店铺隔离读取/写入消息、首条消息自动命名；所有查询带 shopId 关系过滤（铁律），用户消息落库时同步刷新对话活跃时间。
import type { Message } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConversation } from "@/services/conversations.service";
import { DEFAULT_CONVERSATION_TITLE } from "@/types";
import type { HistoryItem, MessageRole, MessageView } from "@/types";

function toView(message: Message): MessageView {
  return {
    id: message.id,
    role: message.role as MessageRole,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function buildTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed.slice(0, 20) : DEFAULT_CONVERSATION_TITLE;
}

// 消息表没有 shopId 列：所有消息查询经 conversation 关系携带 shopId 条件（铁律），跨店铺一律查不到；入口归属校验用于 404 语义。
export async function listMessages(conversationId: string, shopId: string): Promise<MessageView[]> {
  await getConversation({ id: conversationId, shopId });
  const rows = await prisma.message.findMany({
    where: { conversationId, conversation: { is: { shopId } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toView);
}

// 查询生成回复所需的对话历史（早于某条用户消息）。
export async function getTurnHistory(params: {
  conversationId: string;
  shopId: string;
  before: string;
}): Promise<HistoryItem[]> {
  await getConversation({ id: params.conversationId, shopId: params.shopId });
  const rows = await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      conversation: { is: { shopId: params.shopId } },
      createdAt: { lt: new Date(params.before) },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    role: row.role as "user" | "agent",
    content: row.content,
    createdAt: row.createdAt,
  }));
}

// 用户消息落库 + 刷新对话活跃时间 + 首条消息自动命名，三个写操作同一事务原子完成；
// 活跃时间在用户消息到达时立即刷新，不依赖 Agent 是否成功（断网时侧边栏也要立即排序）。
export async function recordUserMessage(params: {
  conversationId: string;
  shopId: string;
  content: string;
}): Promise<MessageView> {
  const conversation = await getConversation({ id: params.conversationId, shopId: params.shopId });
  const now = new Date();
  const [row] = await prisma.$transaction([
    prisma.message.create({ data: { conversationId: params.conversationId, role: "user", content: params.content } }),
    prisma.conversation.updateMany({ where: { id: params.conversationId, shopId: params.shopId }, data: { updatedAt: now } }),
    ...(conversation.title === DEFAULT_CONVERSATION_TITLE
      ? [prisma.conversation.updateMany({ where: { id: params.conversationId, shopId: params.shopId, title: DEFAULT_CONVERSATION_TITLE }, data: { title: buildTitle(params.content) } })]
      : []),
  ]);
  return toView(row);
}

// Agent 回复落库（不再刷新活跃时间：活跃时间已在用户消息到达时刷新过）。
export async function recordAgentMessage(params: {
  conversationId: string;
  shopId: string;
  content: string;
}): Promise<MessageView> {
  await getConversation({ id: params.conversationId, shopId: params.shopId });
  const row = await prisma.message.create({
    data: { conversationId: params.conversationId, role: "agent", content: params.content },
  });
  return toView(row);
}
