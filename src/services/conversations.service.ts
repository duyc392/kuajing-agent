// 用途：对话业务逻辑：按店铺查对话列表（时间倒序）与新建对话；所有查询强制 shopId 过滤，店铺不存在时抛 404。
import { prisma } from "@/lib/db";
import { getShop } from "@/services/shops.service";
import type { ConversationCreateInput, ConversationSummary } from "@/types";

const SUMMARY_SELECT = { id: true, title: true, updatedAt: true } as const;

export async function listConversations(shopId: string): Promise<ConversationSummary[]> {
  await getShop(shopId);
  const rows = await prisma.conversation.findMany({
    where: { shopId },
    orderBy: { updatedAt: "desc" },
    select: SUMMARY_SELECT,
  });
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function createConversation(input: ConversationCreateInput): Promise<ConversationSummary> {
  await getShop(input.shopId);
  const row = await prisma.conversation.create({
    data: { shopId: input.shopId, title: input.title ?? "新对话" },
    select: SUMMARY_SELECT,
  });
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}
