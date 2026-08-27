// 用途：商品 DNA 业务逻辑：读取与创建或覆盖（请求里带 shopId，先按商品+店铺校验归属，再操作唯一 DNA 记录）；
// DNA 永远只有一份当前内容：重复保存是覆盖旧内容，不生成历史版本；商品删除时由数据库级联清理。
import type { ProductDna } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getProduct } from "@/services/products.service";
import type { ProductDnaInput, ProductDnaView, ProductQuery } from "@/types";

function toView(row: ProductDna): ProductDnaView {
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    targetPersona: row.targetPersona,
    useScenarios: row.useScenarios,
    coreSellingPoints: row.coreSellingPoints,
    visualHooks: row.visualHooks,
    recommendedFormats: row.recommendedFormats,
    competitorDifferences: row.competitorDifferences,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getProductDna(query: ProductQuery): Promise<ProductDnaView | null> {
  await getProduct(query);
  const row = await prisma.productDna.findFirst({ where: { productId: query.id, shopId: query.shopId } });
  return row ? toView(row) : null;
}

export async function upsertProductDna(query: ProductQuery, input: ProductDnaInput): Promise<ProductDnaView> {
  await getProduct(query);
  const existing = await prisma.productDna.findFirst({ where: { productId: query.id, shopId: query.shopId } });
  if (existing) {
    return toView(await prisma.productDna.update({ where: { id: existing.id, shopId: query.shopId }, data: { ...input } }));
  }
  try {
    return toView(await prisma.productDna.create({ data: { shopId: query.shopId, productId: query.id, ...input } }));
  } catch (error) {
    // 并发建档撞 productId 唯一约束：改走覆盖更新，仍保证一个商品只有一条 DNA。
    if ((error as { code?: string }).code !== "P2002") throw error;
    const row = await prisma.productDna.findFirstOrThrow({ where: { productId: query.id, shopId: query.shopId } });
    return toView(await prisma.productDna.update({ where: { id: row.id, shopId: query.shopId }, data: { ...input } }));
  }
}
