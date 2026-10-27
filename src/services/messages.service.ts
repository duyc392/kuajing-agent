// 用途：消息持久化（不含 Agent 调用）：按店铺隔离读取/写入消息、首条消息自动命名；所有查询带 shopId 关系过滤（铁律），用户消息落库时同步刷新对话活跃时间。
import type { Message } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getConversation } from "@/services/conversations.service";
import { DEFAULT_CONVERSATION_TITLE } from "@/types";
import type { MessageRole, MessageView, ToolCallRecord } from "@/types";

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

// 更新某条消息中单个工具调用的提议状态（技能提议卡的确认/忽略结果持久化）：按消息 id + 所属店铺校验归属后改写 toolCalls JSON。
export async function updateMessageToolCall(params: {
  messageId: string;
  shopId: string;
  toolCallId: string;
  proposalState: "confirmed" | "ignored";
  skillId?: string;
}): Promise<MessageView> {
  const message = await prisma.message.findFirst({
    where: { id: params.messageId, conversation: { is: { shopId: params.shopId } } },
  });
  if (!message) throw new NotFoundError("消息不存在");
  let calls: ToolCallRecord[] = [];
  if (message.toolCalls) {
    try {
      const parsed: unknown = JSON.parse(message.toolCalls);
      if (Array.isArray(parsed)) calls = parsed as ToolCallRecord[];
    } catch {
      // 历史脏数据按无工具记录处理。
    }
  }
  const index = calls.findIndex((call) => call.id === params.toolCallId);
  if (index === -1) throw new NotFoundError("工具调用记录不存在");
  calls[index] = {
    ...calls[index],
    proposalState: params.proposalState,
    ...(params.skillId ? { skillId: params.skillId } : {}),
  };
  const updated = await prisma.message.update({
    where: { id: params.messageId },
    data: { toolCalls: JSON.stringify(calls) },
  });
  return toView(updated);
}
