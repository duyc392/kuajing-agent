// 用途：Agent 长期记忆业务逻辑（PRD 故事 40-43）：按店铺隔离的列表 / 编辑 / 删除 / 批量新增（提取器写入）。
// 所有查询与写入直接带 shopId 隔离键，且写操作为单次语句（无"先查后写"竞态）；
// 批量新增走事务，重复由数据库唯一约束兜底（并发下不产生重复条目）。纯持久化，不调用模型。
import { Prisma } from "@prisma/client";
import type { MemoryEntry } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { isMemoryCategory, MAX_EXTRACT_CANDIDATES, type MemoryCategory } from "@/config/memory";
import { getShop } from "@/services/shops.service";
import type { ExtractedMemoryCandidate, MemoryEntryView, MemoryUpdateInput } from "@/types";

const CONTENT_MAX = 500;

function toView(entry: MemoryEntry): MemoryEntryView {
  // 分类在写入与种子侧均限定为白名单值，边界转换安全。
  return {
    id: entry.id,
    shopId: entry.shopId,
    category: entry.category as MemoryCategory,
    content: entry.content,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// 分类必须落在白名单内（提取器与设置页共用同一口径）。
function validateCategory(category: MemoryCategory): void {
  if (!isMemoryCategory(category)) {
    throw new ValidationError("记忆分类不在支持列表中");
  }
}

// 唯一约束冲突（同店同分类同内容）视为重复，不算错误。
function isDuplicate(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listMemories(shopId: string): Promise<MemoryEntryView[]> {
  await getShop(shopId);
  const rows = await prisma.memoryEntry.findMany({
    where: { shopId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toView);
}

// 编辑：单次 updateMany 直接携带 id + shopId（铁律），影响行数为 0 时 404——没有"先查后写"的竞态窗口。
export async function updateMemory(query: { id: string; shopId: string }, input: MemoryUpdateInput): Promise<MemoryEntryView> {
  await getShop(query.shopId);
  const data: Record<string, string> = {};
  if (input.category !== undefined) {
    validateCategory(input.category);
    data.category = input.category;
  }
  if (input.content !== undefined) {
    if (input.content.trim() === "" || input.content.length > CONTENT_MAX) {
      throw new ValidationError(`记忆内容不能为空且不能超过 ${CONTENT_MAX} 字`);
    }
    data.content = input.content.trim();
  }
  if (Object.keys(data).length === 0) throw new ValidationError("至少提交一个修改字段（category 或 content）");
  const result = await prisma.memoryEntry.updateMany({
    where: { id: query.id, shopId: query.shopId },
    data,
  });
  if (result.count === 0) throw new NotFoundError("记忆条目不存在");
  const row = await prisma.memoryEntry.findFirst({ where: { id: query.id, shopId: query.shopId } });
  if (!row) throw new NotFoundError("记忆条目不存在");
  return toView(row);
}

// 删除：单次 deleteMany 直接携带 id + shopId，影响行数为 0 时 404；并发删除第二个请求得到 404 而非 500。
export async function deleteMemory(query: { id: string; shopId: string }): Promise<void> {
  await getShop(query.shopId);
  const result = await prisma.memoryEntry.deleteMany({
    where: { id: query.id, shopId: query.shopId },
  });
  if (result.count === 0) throw new NotFoundError("记忆条目不存在");
}

// 批量写入提取候选：校验分类与长度、限制单轮条数；在事务内逐条创建，
// 并发下撞唯一约束（同店同分类同内容已存在）时跳过该条，其余继续；真正的失败整体回滚。
export async function addMemories(shopId: string, candidates: ExtractedMemoryCandidate[]): Promise<MemoryEntryView[]> {
  await getShop(shopId);
  const valid = candidates
    .slice(0, MAX_EXTRACT_CANDIDATES)
    .map((candidate) => ({ category: candidate.category, content: candidate.content.trim() }))
    .filter((candidate) => isMemoryCategory(candidate.category) && candidate.content !== "" && candidate.content.length <= CONTENT_MAX);
  const added: MemoryEntryView[] = [];
  await prisma.$transaction(async (tx) => {
    for (const candidate of valid) {
      try {
        const row = await tx.memoryEntry.create({
          data: { shopId, category: candidate.category, content: candidate.content },
        });
        added.push(toView(row));
      } catch (error) {
        if (isDuplicate(error)) continue;
        throw error;
      }
    }
  });
  return added;
}
