// 用途：消息持久化（不含 Agent 调用）：按店铺隔离读取/写入消息、首条消息自动命名；所有查询带 shopId 关系过滤（铁律），用户消息落库时同步刷新对话活跃时间。
import type { Message } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConversation } from "@/services/conversations.service";
import { DEFAULT_CONVERSATION_TITLE } from "@/types";
import type { HistoryItem, MessageRole, MessageView, ToolCallRecord } from "@/types";

function toView(message: Message): MessageView {
  const view: MessageView = {
    id: message.id,
    role: message.role as MessageRole,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
  // 工具调用记录以 JSON 文本落库，读取时解析回数组；历史脏数据解析失败时忽略（前端按无工具记录渲染）。
  if (message.toolCalls) {
    try {
      const parsed: unknown = JSON.parse(message.toolCalls);
      if (Array.isArray(parsed)) view.toolCalls = parsed as ToolCallRecord[];
    } catch {
      // 忽略无法解析的历史记录。
    }
  }
  return view;
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

// 模型上下文历史限制：只取最近 N 条、单条截断、总字符设预算——防止长对话把全部历史塞给模型导致 token 费用与内存无限增长；
// 超出预算被移除的旧消息随结果返回（上限 10 条），由 Agent 层压缩成摘要保留关键信息（PRD 故事 39）。
const HISTORY_MESSAGE_LIMIT = 20;
const HISTORY_MESSAGE_CHAR_MAX = 2000;
const HISTORY_CHAR_BUDGET = 24000;
const DROPPED_SUMMARY_LIMIT = 10;

export interface TurnHistory {
  items: HistoryItem[];
  dropped: HistoryItem[]; // 被预算裁掉的旧消息（最多 10 条，供压缩摘要用）
}

// 查询生成回复所需的对话历史（早于某条用户消息），按上述限制截断后返回。
export async function getTurnHistory(params: {
  conversationId: string;
  shopId: string;
  before: string;
}): Promise<TurnHistory> {
  await getConversation({ id: params.conversationId, shopId: params.shopId });
  const rows = await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      conversation: { is: { shopId: params.shopId } },
      createdAt: { lt: new Date(params.before) },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_MESSAGE_LIMIT,
  });
  rows.reverse();
  const items = rows.map((row) => ({
    role: row.role as "user" | "agent",
    content: row.content.slice(0, HISTORY_MESSAGE_CHAR_MAX),
    createdAt: row.createdAt,
  }));
  // 总字符预算：从最旧的消息开始丢弃，至少保留最近一条。
  let start = 0;
  let total = items.reduce((sum, item) => sum + item.content.length, 0);
  while (start < items.length - 1 && total > HISTORY_CHAR_BUDGET) {
    total -= items[start].content.length;
    start += 1;
  }
  return {
    items: items.slice(start),
    dropped: items.slice(Math.max(0, start - DROPPED_SUMMARY_LIMIT), start),
  };
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

// Agent 回复落库（不再刷新活跃时间：活跃时间已在用户消息到达时刷新过）；工具调用记录随消息一起落库供历史卡片渲染。
export async function recordAgentMessage(params: {
  conversationId: string;
  shopId: string;
  content: string;
  toolCalls?: ToolCallRecord[];
}): Promise<MessageView> {
  await getConversation({ id: params.conversationId, shopId: params.shopId });
  const row = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: "agent",
      content: params.content,
      toolCalls: params.toolCalls && params.toolCalls.length > 0 ? JSON.stringify(params.toolCalls) : null,
    },
  });
  return toView(row);
}
