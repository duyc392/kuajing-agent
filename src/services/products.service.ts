// 用途：商品业务逻辑：按店铺隔离的列表、详情、创建、编辑、删除（shopId 铁律：所有查询必带 shopId 过滤；删除级联清掉变体与文案）。
import { promises as fs } from "fs";
import type { Product, ProductCopy, ProductVariant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { resolvePublicDiskPath } from "@/lib/public-path";
import { getShop } from "@/services/shops.service";
import type { ProductCreateInput, ProductQuery, ProductSummary, ProductTestingStatus, ProductUpdateInput } from "@/types";

const includeRelations = {
  variants: true,
  copies: { orderBy: { version: "desc" as const } },
};

export type ProductWithRelations = Product & {
  variants: ProductVariant[];
  copies: ProductCopy[];
};

// 摘要中的测品状态：只认三种合法取值，历史/异常值一律按 null 处理（防 "testng" 一类脏值进入前端）。
function testingStatusOf(value: string | null): ProductTestingStatus | null {
  return value === "testing" || value === "scaled" || value === "killed" ? value : null;
}

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
      testingStatus: true,
      createdAt: true,
      dna: { select: { id: true } },
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
    dnaBuilt: row.dna !== null,
    testingStatus: testingStatusOf(row.testingStatus),
    createdAt: row.createdAt.toISOString(),
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

// 删除商品：Prisma 级联只清档案记录，图片文件需在删除前收集路径、删除后逐个清理；
// 路径解析超出 public 目录的异常记录跳过清理（防御纵深），失败只记日志，不影响删除结果。
export async function deleteProduct(query: ProductQuery): Promise<Product> {
  await getProduct(query);
  const imageRows = await prisma.productImage.findMany({
    where: { productId: query.id, product: { is: { shopId: query.shopId } } },
    select: { path: true },
  });
  const product = await prisma.product.delete({ where: { id: query.id, shopId: query.shopId } });
  for (const row of imageRows) {
    const diskPath = resolvePublicDiskPath(row.path);
    if (diskPath === null) {
      console.error("[products] 图片档案路径不合法，跳过文件清理:", row.path);
      continue;
    }
    try {
      await fs.unlink(diskPath);
    } catch (error) {
      console.error("[products] 商品图片文件清理失败:", row.path, error);
    }
  }
  return product;
}
