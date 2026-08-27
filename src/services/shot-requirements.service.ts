// 用途：素材需求业务逻辑（规格 2.6 拍摄执行看板）：从商品关联视频脚本的分镜自动提取去重合并成镜头需求，之后增量同步（新脚本补新镜头），
// 落库持久化后支持执行状态循环切换（待拍摄 → 拍摄中 → 已完成 → 已归档）；所有查询与写入带 shopId 隔离键并保持幂等。
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getProduct } from "@/services/products.service";
import { SHOT_REQUIREMENT_STATUSES } from "@/config/content";
import type { ShotRequirementView } from "@/types/content";

// 分镜 JSON 解析失败返回空（单镜头字段错误只丢弃该镜头，不阻塞整库生成）；scriptIds 解析失败返回空数组。
function parseShots(json: string): { scene: string }[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((shot): shot is { scene: string } => typeof (shot as { scene?: unknown })?.scene === "string");
    }
  } catch {
    // 忽略无法解析的历史数据。
  }
  return [];
}

function parseScriptIds(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

// 提取合并：全部脚本分镜按场景文案去重合并（同文案视为同一镜头，合并脚本引用），场景按出现顺序稳定排序。
function mergeShots(scripts: { id: string; shots: { scene: string }[] }[]): { scene: string; scriptIds: string[] }[] {
  const merged = new Map<string, { scene: string; scriptIds: string[] }>();
  for (const script of scripts) {
    for (const shot of script.shots) {
      const key = shot.scene.trim();
      if (key === "") continue;
      const existing = merged.get(key);
      if (existing) {
        if (!existing.scriptIds.includes(script.id)) existing.scriptIds.push(script.id);
      } else {
        merged.set(key, { scene: key, scriptIds: [script.id] });
      }
    }
  }
  return [...merged.values()];
}

function toView(row: { id: string; shopId: string; productId: string; shotCode: string; scene: string; actionDescription: string; propsAndLighting: string; scriptIds: string; status: string; createdAt: Date; updatedAt: Date }): ShotRequirementView {
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    shotCode: row.shotCode,
    scene: row.scene,
    actionDescription: row.actionDescription,
    propsAndLighting: row.propsAndLighting,
    scriptIds: parseScriptIds(row.scriptIds),
    status: isValidStatus(row.status) ? row.status : SHOT_REQUIREMENT_STATUSES[0],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// 状态白名单守卫：数据库历史脏值回落到第一个合法状态，不让 UI 拿到白名单之外的值。
function isValidStatus(status: string): status is ShotRequirementView["status"] {
  return (SHOT_REQUIREMENT_STATUSES as readonly string[]).includes(status);
}

// 同步（幂等，显式写操作，由 POST 接口触发）：事务内以「当前脚本分镜集合」为唯一真相——
// 新场景追加、引用集合全量替换（删脚本后引用自动收缩）、所有脚本中消失的场景删除记录；并发由唯一约束兜底。
async function syncShotRequirements(shopId: string, productId: string): Promise<ShotRequirementView[]> {
  await getProduct({ id: productId, shopId });
  return prisma.$transaction(async (tx) => {
    const scripts = await tx.videoScript.findMany({
      where: { shopId, productId },
      select: { id: true, shots: true },
    });
    const merged = mergeShots(scripts.map((script) => ({ id: script.id, shots: parseShots(script.shots) })));
    const mergedByScene = new Map(merged.map((item) => [item.scene, item]));

    const existing = await tx.shotRequirement.findMany({
      where: { shopId, productId },
      orderBy: { shotCode: "asc" },
    });

    // 删除：所有脚本中已不存在的场景（脚本全部删除时等于清空该商品镜头表）。
    const removed = existing.filter((row) => !mergedByScene.has(row.scene));
    if (removed.length > 0) {
      await tx.shotRequirement.deleteMany({ where: { shopId, productId, id: { in: removed.map((row) => row.id) } } });
    }

    // 更新：已存在场景的引用集合全量替换为当前合并结果（新增引用补入、删除引用收缩）。
    for (const row of existing) {
      const item = mergedByScene.get(row.scene);
      if (!item) continue;
      const current = parseScriptIds(row.scriptIds);
      const sameSet = current.length === item.scriptIds.length && current.every((id) => item.scriptIds.includes(id));
      if (!sameSet) {
        const result = await tx.shotRequirement.updateMany({
          where: { id: row.id, shopId, productId },
          data: { scriptIds: JSON.stringify(item.scriptIds) },
        });
        if (result.count !== 1) throw new NotFoundError("镜头不存在");
      }
    }

    // 新增：当前脚本有、表里没有的场景；shotCode 按现有数量继续编号，保证稳定。
    const maxCode = existing.reduce((max, row) => {
      const number = Number.parseInt(row.shotCode.replace(/^S/, ""), 10);
      return Number.isInteger(number) ? Math.max(max, number) : max;
    }, 0);
    let appended = 0;
    for (const item of merged) {
      if (existing.some((row) => row.scene === item.scene)) continue;
      let nextCode = maxCode + appended + 1;
      while (existing.some((row) => row.shotCode === `S${String(nextCode).padStart(2, "0")}`)) nextCode += 1;
      try {
        await tx.shotRequirement.create({
          data: {
            shopId,
            productId,
            shotCode: `S${String(nextCode).padStart(2, "0")}`,
            scene: item.scene,
            actionDescription: item.scene,
            propsAndLighting: "",
            scriptIds: JSON.stringify(item.scriptIds),
            status: SHOT_REQUIREMENT_STATUSES[0],
          },
        });
        appended += 1;
      } catch (error) {
        // 并发同步已插入同一镜头编号（唯一约束冲突 P2002）时跳过，其余错误照常上抛。
        if (!isUniqueViolation(error)) throw error;
      }
    }

    const rows = await tx.shotRequirement.findMany({
      where: { shopId, productId },
      orderBy: { shotCode: "asc" },
    });
    return rows.map(toView);
  });
}

// Prisma 唯一约束冲突判定：按错误码 P2002（不匹配错误文本，避免 Prisma 版本文案变化导致漏判）。
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

// 纯读：列表展示用，不触发任何写操作（读接口不写库）。
export async function listShotRequirements(shopId: string, productId: string): Promise<ShotRequirementView[]> {
  await getProduct({ id: productId, shopId });
  const rows = await prisma.shotRequirement.findMany({
    where: { shopId, productId },
    orderBy: { shotCode: "asc" },
  });
  return rows.map(toView);
}

// 显式同步：由 POST 接口触发；返回同步后的全量镜头。
export async function syncShotRequirementsForProduct(shopId: string, productId: string): Promise<ShotRequirementView[]> {
  return syncShotRequirements(shopId, productId);
}

export async function updateShotRequirementStatus(shopId: string, shotRequirementId: string, status: string): Promise<ShotRequirementView> {
  // 铁律：更新条件必须同时带 id 与 shopId，更新行数为 0 视为不存在或跨店铺，统一 404（不泄露资源归属）。
  const result = await prisma.shotRequirement.updateMany({
    where: { id: shotRequirementId, shopId },
    data: { status },
  });
  if (result.count === 0) throw new NotFoundError("镜头不存在");
  const row = await prisma.shotRequirement.findFirst({
    where: { id: shotRequirementId, shopId },
  });
  return toView(row as NonNullable<typeof row>);
}
