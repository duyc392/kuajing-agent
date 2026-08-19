// 用途：文案版本业务逻辑：创建新版本（事务内计算版本号、新版本成为当前、冲突有限重试）、切换当前版本与按店铺列出版本；所有查询与写入直接带 shopId 隔离键，纯持久化，不调用模型。
import { Prisma } from "@prisma/client";
import type { ProductCopy } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { getProduct } from "@/services/products.service";

export interface CopyCreateInput {
  productId: string;
  shopId: string;
  title: string;
  description: string;
  sellingPoints: string | null;
  language: string;
  source: "ai" | "human";
}

export interface CopySwitchParams {
  productId: string;
  copyId: string;
  shopId: string;
}

const MAX_VERSION_RETRIES = 3;

function isVersionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// 事务内计算版本号并创建：并发撞号时数据库唯一约束兜底，捕获冲突后重新计算，最多重试 3 次。
export async function createCopy(input: CopyCreateInput): Promise<ProductCopy> {
  await getProduct({ id: input.productId, shopId: input.shopId });
  for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const latest = await tx.productCopy.findFirst({
          where: { productId: input.productId, shopId: input.shopId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const version = (latest?.version ?? 0) + 1;
        // 旧当前版本降级 + 新版本落库并设为当前，同一事务保证任何时刻至多一个当前版本。
        await tx.productCopy.updateMany({
          where: { productId: input.productId, shopId: input.shopId, isCurrent: true },
          data: { isCurrent: false },
        });
        return tx.productCopy.create({
          data: {
            productId: input.productId,
            shopId: input.shopId,
            title: input.title,
            description: input.description,
            sellingPoints: input.sellingPoints,
            language: input.language,
            version,
            source: input.source,
            isCurrent: true,
          },
        });
      });
    } catch (error) {
      if (!isVersionConflict(error) || attempt === MAX_VERSION_RETRIES - 1) throw error;
      // 撞号（并发生成）：重新进入事务计算最新版本号再试。
    }
  }
  throw new AppError("文案版本创建失败，请重试", "COPY_VERSION_CONFLICT", 500);
}

// 切换当前版本：校验商品归属与版本归属（跨店铺一律 404），同事务内先全部降级再置目标为当前，返回更新后的记录。
export async function setCurrentCopy(params: CopySwitchParams): Promise<ProductCopy> {
  await getProduct({ id: params.productId, shopId: params.shopId });
  const target = await prisma.productCopy.findFirst({
    where: { id: params.copyId, productId: params.productId, shopId: params.shopId },
  });
  if (!target) throw new NotFoundError("文案版本不存在");
  const [, updated] = await prisma.$transaction([
    prisma.productCopy.updateMany({
      where: { productId: params.productId, shopId: params.shopId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.productCopy.update({
      where: { id: params.copyId, shopId: params.shopId },
      data: { isCurrent: true },
    }),
  ]);
  return updated;
}

export async function listCopies(productId: string, shopId: string): Promise<ProductCopy[]> {
  await getProduct({ id: productId, shopId });
  return prisma.productCopy.findMany({
    where: { productId, shopId },
    orderBy: { version: "desc" },
  });
}
