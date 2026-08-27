// 用途：视频分镜脚本业务逻辑（PRD 故事 25-27）：按店铺列出、详情、创建（对话工具写入）、修改（详情页编辑）；所有查询与写入直接带 shopId 隔离键，纯持久化，不调用模型。
import type { VideoScript } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getProduct } from "@/services/products.service";
import { getShop } from "@/services/shops.service";
import type { ScriptCreateInput, ScriptDetailView, ScriptShot, ScriptSummary, ScriptUpdateInput } from "@/types";

type ScriptRow = VideoScript & { product: { name: string } | null };

// 分镜以 JSON 文本落库（SQLite 无 Json 类型），读取时解析；历史脏数据解析失败按空数组渲染。
function parseShots(json: string): ScriptShot[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter(isScriptShot);
    }
  } catch {
    // 忽略无法解析的历史数据。
  }
  return [];
}

function isScriptShot(value: unknown): value is ScriptShot {
  if (typeof value !== "object" || value === null) return false;
  const shot = value as Record<string, unknown>;
  return typeof shot.scene === "string" && shot.scene.trim() !== ""
    && typeof shot.voiceover === "string" && shot.voiceover.trim() !== ""
    && typeof shot.subtitle === "string" && shot.subtitle.trim() !== ""
    && Number.isInteger(shot.seconds) && Number(shot.seconds) > 0;
}

function toSummary(row: ScriptRow): ScriptSummary {
  return {
    id: row.id,
    type: row.type,
    duration: row.duration,
    hook: row.hook,
    style: row.style,
    productName: row.product?.name ?? null,
    version: row.version,
    parentScriptId: row.parentScriptId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: ScriptRow): ScriptDetailView {
  return {
    id: row.id,
    productId: row.productId,
    type: row.type,
    duration: row.duration,
    hook: row.hook,
    cta: row.cta,
    style: row.style,
    shots: parseShots(row.shots),
    version: row.version,
    parentScriptId: row.parentScriptId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listScripts(shopId: string, productId?: string): Promise<ScriptSummary[]> {
  await getShop(shopId);
  if (productId) await getProduct({ id: productId, shopId });
  const rows = await prisma.videoScript.findMany({
    where: { shopId, ...(productId ? { productId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true } } },
  });
  return rows.map(toSummary);
}

export async function getScript(query: { id: string; shopId: string }): Promise<ScriptDetailView> {
  const row = await prisma.videoScript.findFirst({
    where: { id: query.id, shopId: query.shopId },
    include: { product: { select: { name: true } } },
  });
  if (!row) throw new NotFoundError("脚本不存在");
  return toDetail(row);
}

export async function createScript(input: ScriptCreateInput): Promise<ScriptDetailView> {
  await getShop(input.shopId);
  if (input.productId !== null) await getProduct({ id: input.productId, shopId: input.shopId });
  if (input.shots.length === 0) throw new ValidationError("分镜不能为空");
  const row = await prisma.videoScript.create({
    data: {
      shopId: input.shopId,
      productId: input.productId,
      type: input.type,
      duration: input.duration,
      hook: input.hook,
      cta: input.cta,
      style: input.style,
      shots: JSON.stringify(input.shots),
    },
    include: { product: { select: { name: true } } },
  });
  return toDetail(row);
}

export async function updateScript(query: { id: string; shopId: string }, input: ScriptUpdateInput): Promise<ScriptDetailView> {
  const current = await getScript(query);
  if (Object.keys(input).length === 0) return current;
  const row = await prisma.videoScript.update({
    where: { id: query.id, shopId: query.shopId },
    data: { ...input },
    include: { product: { select: { name: true } } },
  });
  return toDetail(row);
}
