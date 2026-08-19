// 用途：商品变体业务逻辑：按店铺隔离的变体列表 / 创建 / 更新 / 删除（每个操作先校验商品归属店铺，跨店铺一律 404）。
import { Prisma } from "@prisma/client";
import type { ProductVariant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_INT32, MAX_PRICE } from "@/lib/numbers";
import { getProduct } from "@/services/products.service";
import type { VariantCreateInput, VariantQuery, VariantUpdateInput } from "@/types";

// 数据库唯一约束冲突（同一商品内 SKU 重复）转为参数校验错误，避免冒泡成 500。
function isSkuConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// 服务层范围兜底：API schema 之外的其他调用者（如未来的 Agent 工具）也不能写入越界价格 / 超出 32 位整数的库存。
function validateRanges(input: VariantCreateInput | VariantUpdateInput): void {
  if (input.price !== undefined && input.price !== null && (!Number.isFinite(input.price) || input.price < 0 || input.price > MAX_PRICE)) {
    throw new ValidationError("价格必须是 0 到 1000 万之间的有限数字");
  }
  if (input.stock !== undefined && input.stock !== null && (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > MAX_INT32)) {
    throw new ValidationError("库存必须是 0 到 2147483647 之间的整数");
  }
}

export async function listVariants(productId: string, shopId: string): Promise<ProductVariant[]> {
  await getProduct({ id: productId, shopId });
  return prisma.productVariant.findMany({
    where: { productId, product: { is: { shopId } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function createVariant(productId: string, shopId: string, input: VariantCreateInput): Promise<ProductVariant> {
  await getProduct({ id: productId, shopId });
  validateRanges(input);
  try {
    return await prisma.productVariant.create({
      data: {
        productId,
        sku: input.sku,
        color: input.color ?? null,
        size: input.size ?? null,
        price: input.price ?? null,
        stock: input.stock ?? null,
      },
    });
  } catch (error) {
    if (isSkuConflict(error)) throw new ValidationError("SKU 已存在，同一商品下不能重复");
    throw error;
  }
}

export async function updateVariant(query: VariantQuery, input: VariantUpdateInput): Promise<ProductVariant> {
  await getProduct({ id: query.productId, shopId: query.shopId });
  validateRanges(input);
  const variant = await prisma.productVariant.findFirst({
    where: { id: query.variantId, productId: query.productId, product: { is: { shopId: query.shopId } } },
  });
  if (!variant) throw new NotFoundError("变体不存在");
  // 只更新本次提交的字段：未提交（undefined）的字段保持原值，显式传 null 表示清空。
  const data: Record<string, string | number | null> = {};
  if (input.sku !== undefined) data.sku = input.sku;
  if (input.color !== undefined) data.color = input.color;
  if (input.size !== undefined) data.size = input.size;
  if (input.price !== undefined) data.price = input.price;
  if (input.stock !== undefined) data.stock = input.stock;
  try {
    return await prisma.productVariant.update({
      where: { id: query.variantId, product: { is: { shopId: query.shopId } } },
      data,
    });
  } catch (error) {
    if (isSkuConflict(error)) throw new ValidationError("SKU 已存在，同一商品下不能重复");
    throw error;
  }
}

export async function deleteVariant(query: VariantQuery): Promise<void> {
  await getProduct({ id: query.productId, shopId: query.shopId });
  const variant = await prisma.productVariant.findFirst({
    where: { id: query.variantId, productId: query.productId, product: { is: { shopId: query.shopId } } },
  });
  if (!variant) throw new NotFoundError("变体不存在");
  await prisma.productVariant.delete({
    where: { id: query.variantId, product: { is: { shopId: query.shopId } } },
  });
}
