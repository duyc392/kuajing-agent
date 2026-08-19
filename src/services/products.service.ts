// 用途：商品业务逻辑：按店铺隔离的列表、详情、创建、编辑、删除（shopId 铁律：所有查询必带 shopId 过滤；删除级联清掉变体与文案）。
import { promises as fs } from "fs";
import path from "path";
import type { Product, ProductCopy, ProductVariant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getShop } from "@/services/shops.service";
import type { ProductCreateInput, ProductQuery, ProductSummary, ProductUpdateInput } from "@/types";

const includeRelations = {
  variants: true,
  copies: { orderBy: { version: "desc" as const } },
};

export type ProductWithRelations = Product & {
  variants: ProductVariant[];
  copies: ProductCopy[];
};

// 列表只取摘要字段与关系计数，不返回变体明细与文案正文（列表页用不到，避免一次请求拉全量历史内容）。
export async function listProducts(shopId: string): Promise<ProductSummary[]> {
  await getShop(shopId);
  const rows = await prisma.product.findMany({
    where: { shopId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      _count: { select: { variants: true, copies: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    variantCount: row._count.variants,
    copyCount: row._count.copies,
  }));
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
  await getShop(shopId);
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
  return prisma.product.update({ where: { id: query.id, shopId: query.shopId }, data: { ...input } });
}

// 删除商品：Prisma 级联只清档案记录，图片文件需在删除前收集路径、删除后逐个清理（失败只记日志，不影响删除结果）。
export async function deleteProduct(query: ProductQuery): Promise<Product> {
  await getProduct(query);
  const imageRows = await prisma.productImage.findMany({
    where: { productId: query.id, product: { is: { shopId: query.shopId } } },
    select: { path: true },
  });
  const product = await prisma.product.delete({ where: { id: query.id, shopId: query.shopId } });
  for (const row of imageRows) {
    try {
      await fs.unlink(path.join(process.cwd(), "public", row.path.replace(/^\/+/, "")));
    } catch (error) {
      console.error("[products] 商品图片文件清理失败:", row.path, error);
    }
  }
  return product;
}
