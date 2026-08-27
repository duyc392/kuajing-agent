// 用途：商品图片档案业务逻辑（PRD 数据对象 ProductImage）：按店铺隔离的列表 / 批量建档 / 应用标记 / 删除。
// 图片文件本体在 public/generated/，本服务只管理档案记录；删除记录时尽力清理磁盘文件。
// 生成动作在 agent/image-flow（对话工具），不经过本服务。
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { ProductImage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { detectImageMime, extensionOfMime, IMAGE_MAX_BYTES } from "@/lib/image-bytes";
import { getProduct } from "@/services/products.service";
import type { ProductImageCreateInput, ProductImageType, ProductImageView, ProductImageUpdateInput } from "@/types";

function toView(row: ProductImage): ProductImageView {
  return {
    id: row.id,
    productId: row.productId,
    path: row.path,
    type: row.type as ProductImageType,
    prompt: row.prompt,
    applied: row.applied,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

// 相对路径（/generated/xxx.png）→ 磁盘绝对路径，删除档案时清理文件用。
function toDiskPath(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", clean);
}

export async function listImages(productId: string, shopId: string): Promise<ProductImageView[]> {
  await getProduct({ id: productId, shopId });
  const rows = await prisma.productImage.findMany({
    where: { productId, product: { is: { shopId } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toView);
}

// 生成流程批量建档：档案写入走事务，任一失败整体回滚，不留下"有文件无记录"的脏数据。
export async function createImages(productId: string, shopId: string, entries: ProductImageCreateInput[]): Promise<ProductImageView[]> {
  await getProduct({ id: productId, shopId });
  if (entries.length === 0) throw new ValidationError("图片档案不能为空");
  const rows = await prisma.$transaction(
    entries.map((entry) =>
      prisma.productImage.create({
        data: {
          productId,
          path: entry.path,
          type: entry.type,
          prompt: entry.prompt,
          applied: false,
          sortOrder: entry.sortOrder,
        },
      }),
    ),
  );
  return rows.map(toView);
}

// 修改档案（应用标记 / 显示顺序 / 用途）：单次 updateMany 直接携带 id + 店铺关系（铁律，无先查后写竞态）。
export async function updateImage(query: { id: string; shopId: string }, input: ProductImageUpdateInput): Promise<ProductImageView> {
  const data: Record<string, unknown> = {};
  if (input.applied !== undefined) data.applied = input.applied;
  if (input.sortOrder !== undefined) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) throw new ValidationError("显示顺序必须是非负整数");
    data.sortOrder = input.sortOrder;
  }
  if (input.type !== undefined) data.type = input.type;
  if (Object.keys(data).length === 0) throw new ValidationError("至少提交一个修改字段（applied / sortOrder / type）");

  // 应用主图时同商品其他主图自动取消应用，保证"已应用主图"唯一；detail/variant 不互相排他。
  // effectiveType 用修改后的类型判断：同时提交 { type: "main", applied: true } 也能触发排他。
  const current = await prisma.productImage.findFirst({
    where: { id: query.id, product: { is: { shopId: query.shopId } } },
  });
  if (!current) throw new NotFoundError("图片不存在");
  const effectiveType = (data.type as string | undefined) ?? current.type;
  await prisma.$transaction([
    ...(input.applied === true && effectiveType === "main"
      ? [prisma.productImage.updateMany({
          where: { productId: current.productId, type: "main", applied: true, id: { not: query.id }, product: { is: { shopId: query.shopId } } },
          data: { applied: false },
        })]
      : []),
    prisma.productImage.updateMany({ where: { id: query.id, product: { is: { shopId: query.shopId } } }, data }),
  ]);
  const row = await prisma.productImage.findFirst({
    where: { id: query.id, product: { is: { shopId: query.shopId } } },
  });
  if (!row) throw new NotFoundError("图片不存在");
  return toView(row);
}

// 删除档案 + 尽力清理磁盘文件：文件删除失败只记日志，不影响档案删除。
export async function deleteImage(query: { id: string; shopId: string }): Promise<void> {
  const row = await prisma.productImage.findFirst({
    where: { id: query.id, product: { is: { shopId: query.shopId } } },
  });
  if (!row) throw new NotFoundError("图片不存在");
  const result = await prisma.productImage.deleteMany({
    where: { id: query.id, product: { is: { shopId: query.shopId } } },
  });
  if (result.count === 0) throw new NotFoundError("图片不存在");
  try {
    await fs.unlink(toDiskPath(row.path));
  } catch (error) {
    console.error("[images] 图片文件删除失败（档案已删除）:", error);
  }
}

// 上传图片建档（PRD 故事 24：上传已有图片后生成变体）：魔数校验 + 大小上限 + 随机文件名落盘，按店铺归档为主图草稿。
export async function createUploadedImage(productId: string, shopId: string, file: { bytes: Buffer }): Promise<ProductImageView> {
  await getProduct({ id: productId, shopId });
  if (file.bytes.length === 0 || file.bytes.length > IMAGE_MAX_BYTES) {
    throw new ValidationError("图片文件为空或超过 10MB 上限");
  }
  const mimeType = detectImageMime(file.bytes);
  if (!mimeType) throw new ValidationError("仅支持 PNG / JPEG / WebP 格式的图片");
  const dir = path.join(process.cwd(), "public", "generated");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extensionOfMime(mimeType)}`;
  const diskPath = path.join(dir, filename);
  await fs.writeFile(diskPath, file.bytes);
  try {
    const existing = await prisma.productImage.findMany({
      where: { productId, product: { is: { shopId } } },
      select: { sortOrder: true },
    });
    const maxSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0);
    const row = await prisma.productImage.create({
      data: {
        productId,
        path: `/generated/${filename}`,
        type: "main",
        prompt: "卖家上传",
        applied: false,
        sortOrder: maxSortOrder + 1,
      },
    });
    return toView(row);
  } catch (error) {
    // 数据库建档失败：回收刚写入的图片文件，不留无档案的孤儿图片。
    try {
      await fs.unlink(diskPath);
    } catch (cleanupError) {
      console.error("[images] 孤儿图片清理失败:", cleanupError);
    }
    throw error;
  }
}
