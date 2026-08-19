// 用途：直播脚本业务逻辑（PRD 故事 28）：按店铺列出、详情、创建（对话工具写入）、修改（详情页整段流程编辑，总时长由阶段分钟数重算）。
// 商品列表与流程以 JSON 文本落库（SQLite 无 Json 类型）；读取兼容旧版分隔符文本。所有查询与写入直接带 shopId 隔离键，纯持久化，不调用模型。
import type { LiveScript } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { liveFlowStructureProblems } from "@/lib/live-flow";
import { getShop } from "@/services/shops.service";
import type { LiveScriptCreateInput, LiveScriptDetailView, LiveSegment, LiveScriptSummary, LiveScriptUpdateInput } from "@/types";

// 商品列表读取：新格式为 JSON 数组；旧版种子数据是「、/，/,」分隔的文本，向后兼容拆分。
function parseProductNames(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // 非 JSON：按旧格式拆分。
  }
  return text
    .split(/[、，,]/)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

// 流程读取：新格式为 JSON 数组；旧版纯文本无法结构化，返回空数组（界面按"无阶段数据"渲染）。
function parseSegments(text: string): LiveSegment[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as LiveSegment[];
  } catch {
    // 忽略无法解析的历史数据。
  }
  return [];
}

function toSummary(row: LiveScript): LiveScriptSummary {
  return {
    id: row.id,
    duration: row.duration,
    productNames: parseProductNames(row.productList),
    segmentCount: parseSegments(row.flow).length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: LiveScript): LiveScriptDetailView {
  return {
    id: row.id,
    duration: row.duration,
    productNames: parseProductNames(row.productList),
    segments: parseSegments(row.flow),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// 服务层兜底校验：阶段非空、字段完整、分钟数为正整数（API schema 之外的其他调用者也不能写入非法流程）。
function validateSegments(segments: LiveSegment[]): void {
  if (segments.length === 0) throw new ValidationError("直播脚本至少需要一个阶段");
  if (segments.length > 30) throw new ValidationError("阶段数量过多（上限 30 个）");
  for (const segment of segments) {
    if (segment.phase.trim() === "" || segment.goal.trim() === "" || segment.script.trim() === "") {
      throw new ValidationError("阶段名称、目标与话术不能为空");
    }
    if (!Number.isInteger(segment.minutes) || segment.minutes < 1) {
      throw new ValidationError("阶段时长必须是正整数分钟");
    }
  }
}

// 服务层结构校验：创建与修改都必须仍是符合需求的直播流程（首阶段开场 + 四环节齐全），违规给出具体原因。
function ensureFlowStructure(segments: LiveSegment[]): void {
  const problems = liveFlowStructureProblems(segments);
  if (problems.length > 0) {
    throw new ValidationError(`流程不符合直播脚本要求：${problems.join("；")}，请调整后保存`);
  }
}

export async function listLiveScripts(shopId: string): Promise<LiveScriptSummary[]> {
  await getShop(shopId);
  const rows = await prisma.liveScript.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSummary);
}

export async function getLiveScript(query: { id: string; shopId: string }): Promise<LiveScriptDetailView> {
  const row = await prisma.liveScript.findFirst({
    where: { id: query.id, shopId: query.shopId },
  });
  if (!row) throw new NotFoundError("直播脚本不存在");
  return toDetail(row);
}

export async function createLiveScript(input: LiveScriptCreateInput): Promise<LiveScriptDetailView> {
  await getShop(input.shopId);
  validateSegments(input.segments);
  ensureFlowStructure(input.segments);
  const sumMinutes = input.segments.reduce((total, segment) => total + segment.minutes, 0);
  if (input.duration !== sumMinutes * 60) throw new ValidationError("直播总时长必须等于各阶段分钟数总和");
  const row = await prisma.liveScript.create({
    data: {
      shopId: input.shopId,
      duration: input.duration,
      productList: JSON.stringify(input.productNames),
      flow: JSON.stringify(input.segments),
    },
  });
  return toDetail(row);
}

export async function updateLiveScript(query: { id: string; shopId: string }, input: LiveScriptUpdateInput): Promise<LiveScriptDetailView> {
  await getLiveScript(query);
  validateSegments(input.segments);
  // 验收要求"详情修改后仍是一份符合需求的直播流程"：禁止删掉开场或任一必要环节。
  ensureFlowStructure(input.segments);
  // 总时长由阶段分钟数重算并落库：单独修改时长不开放，两者永远一致。
  const sumMinutes = input.segments.reduce((total, segment) => total + segment.minutes, 0);
  const row = await prisma.liveScript.update({
    where: { id: query.id, shopId: query.shopId },
    data: { duration: sumMinutes * 60, flow: JSON.stringify(input.segments) },
  });
  return toDetail(row);
}
