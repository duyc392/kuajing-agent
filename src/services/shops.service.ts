// 用途：店铺业务逻辑：列表、详情、创建、编辑、归档（归档代替删除，对应 PRD 用户故事：添加 / 编辑 / 归档店铺）。
import type { Shop } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { ShopCreateInput, ShopUpdateInput } from "@/types";

export async function listShops(includeArchived = false): Promise<Shop[]> {
  return prisma.shop.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { createdAt: "asc" },
  });
}

export async function getShop(id: string): Promise<Shop> {
  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) throw new NotFoundError("店铺不存在");
  return shop;
}

export async function createShop(input: ShopCreateInput): Promise<Shop> {
  return prisma.shop.create({
    data: { name: input.name, market: input.market, description: input.description ?? null },
  });
}

export async function updateShop(id: string, input: ShopUpdateInput): Promise<Shop> {
  await getShop(id);
  return prisma.shop.update({ where: { id }, data: { ...input } });
}

export async function archiveShop(id: string): Promise<Shop> {
  await getShop(id);
  return prisma.shop.update({ where: { id }, data: { archived: true } });
}
