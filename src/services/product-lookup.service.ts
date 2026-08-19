// 用途：按卖家原话的商品名称解析商品（同店同名取最早建档的一个），严格限定当前店铺；文案、脚本等对话工具共用，找不到给中文 404 语义错误。
import type { Product } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

export async function resolveProductByName(params: { productName: string; shopId: string }): Promise<Product> {
  const trimmed = params.productName.trim();
  if (trimmed === "") throw new ValidationError("缺少商品名称");
  if (trimmed.length > 200) throw new ValidationError("商品名称过长（上限 200 字）");
  const product = await prisma.product.findFirst({
    where: { name: trimmed, shopId: params.shopId },
    orderBy: { createdAt: "asc" },
  });
  if (!product) throw new NotFoundError(`商品不存在：${trimmed}，请确认商品名称与商品列表一致`);
  return product;
}
