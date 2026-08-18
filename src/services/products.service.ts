// 用途：商品业务逻辑：按店铺隔离的列表、详情、创建、编辑、删除（shopId 铁律：所有查询必带 shopId 过滤；删除级联清掉变体与文案）。
import type { Product, ProductCopy, ProductVariant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { ProductCreateInput, ProductQuery, ProductUpdateInput } from "@/types";

const includeRelations = {
  variants: true,
  copies: { orderBy: { version: "desc" as const } },
};

export type ProductWithRelations = Product & {
  variants: ProductVariant[];
  copies: ProductCopy[];
};

export async function listProducts(shopId: string): Promise<ProductWithRelations[]> {
  return prisma.product.findMany({ where: { shopId }, include: includeRelations, orderBy: { createdAt: "asc" } });
}

export async function getProduct(query: ProductQuery): Promise<ProductWithRelations> {
  const product = await prisma.product.findFirst({
    where: { id: query.id, shopId: query.shopId },
    include: includeRelations,
  });
  if (!product) throw new NotFoundError("商品不存在");
  return product;
}

export async function createProduct(shopId: string, input: ProductCreateInput): Promise<Product> {
  const shop = await prisma.shop.findFirst({ where: { id: shopId } });
  if (!shop) throw new NotFoundError("店铺不存在，无法创建商品");
  return prisma.product.create({
    data: {
      shopId,
      name: input.name,
      category: input.category ?? null,
      price: input.price ?? null,
      description: input.description ?? null,
      skuRule: input.skuRule ?? null,
    },
  });
}

export async function updateProduct(query: ProductQuery, input: ProductUpdateInput): Promise<Product> {
  await getProduct(query);
  return prisma.product.update({ where: { id: query.id }, data: { ...input } });
}

export async function deleteProduct(query: ProductQuery): Promise<Product> {
  await getProduct(query);
  return prisma.product.delete({ where: { id: query.id } });
}
