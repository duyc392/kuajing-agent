// 用途：对话业务逻辑：按店铺查对话列表（时间倒序）与新建对话；所有查询强制 shopId 过滤，店铺不存在时抛 404。
import type { Conversation } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getShop } from "@/services/shops.service";
import { DEFAULT_CONVERSATION_TITLE } from "@/types";
import type { ConversationCreateInput, ConversationSummary } from "@/types";

const SUMMARY_SELECT = { id: true, title: true, updatedAt: true } as const;

export async function listConversations(shopId: string): Promise<ConversationSummary[]> {
  await getShop(shopId);
  const rows = await prisma.conversation.findMany({
    where: { shopId },
    // 并列时间戳时以 id 作次级排序键（cuid 按时间编码），保证刷新后顺序稳定。
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: SUMMARY_SELECT,
  });
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function createConversation(input: ConversationCreateInput): Promise<ConversationSummary> {
  await getShop(input.shopId);
  const row = await prisma.conversation.create({
    data: { shopId: input.shopId, title: input.title ?? DEFAULT_CONVERSATION_TITLE },
    select: SUMMARY_SELECT,
  });
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

// 用途：单对话归属校验与读取：id + shopId 双条件查询，跨店铺访问一律视为不存在（404）。
export async function getConversation(query: { id: string; shopId: string }): Promise<Conversation> {
  const conversation = await prisma.conversation.findFirst({ where: { id: query.id, shopId: query.shopId } });
  if (!conversation) throw new NotFoundError("对话不存在");
  return conversation;
}
