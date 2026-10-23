// 用途：阶段快照业务逻辑：把 Agent 各阶段产物序列化落库，并支持读取最新版 / 上一版做局部重写。
// 只做存取，不解释 payload 内容；所有查询与写入强制带 shopId（铁律），版本号在同店同阶段内自增。
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getShop } from "@/services/shops.service";
import {
  SNAPSHOT_PAYLOAD_MAX,
  SNAPSHOT_STAGES,
  type SnapshotListDetails,
  type SnapshotLoadDetails,
  type SnapshotSaveDetails,
  type SnapshotStage,
} from "@/types";

const MAX_VERSION_RETRIES = 3;
const DEFAULT_LIST_LIMIT = 10;

function assertStage(stage: string): SnapshotStage {
  if (!SNAPSHOT_STAGES.includes(stage as SnapshotStage)) {
    throw new ValidationError(`未知的阶段：${stage}，可用阶段为 ${SNAPSHOT_STAGES.join(" / ")}`);
  }
  return stage as SnapshotStage;
}

// payload 必须是合法 JSON：后续阶段要读回来做局部改写，存坏数据等于埋雷。
function assertPayload(payload: string): void {
  if (payload.trim() === "") throw new ValidationError("快照内容不能为空");
  if (payload.length > SNAPSHOT_PAYLOAD_MAX) {
    throw new ValidationError(`快照内容过大（上限 ${SNAPSHOT_PAYLOAD_MAX} 字符），请精简后再保存`);
  }
  try {
    JSON.parse(payload);
  } catch {
    throw new ValidationError("快照内容必须是合法 JSON 文本");
  }
}

function isVersionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function saveSnapshot(params: { shopId: string; stage: string; payload: string }): Promise<SnapshotSaveDetails> {
  await getShop(params.shopId);
  const stage = assertStage(params.stage);
  assertPayload(params.payload);
  for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const latest = await tx.workflowSnapshot.findFirst({
          where: { shopId: params.shopId, stage },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        return tx.workflowSnapshot.create({
          data: { shopId: params.shopId, stage, version: (latest?.version ?? 0) + 1, payload: params.payload },
        });
      });
      return { snapshotId: row.id, stage, version: row.version, createdAt: row.createdAt.toISOString() };
    } catch (error) {
      if (!isVersionConflict(error) || attempt === MAX_VERSION_RETRIES - 1) throw error;
      // 并发写撞版本号：重新读最新版本再试。
    }
  }
  throw new ValidationError("快照保存冲突，请重试");
}

export interface LoadSnapshotInput {
  shopId: string;
  stage: string;
  /** latest=最新版（默认）；previous=上一版（基于当前最新版回退一格，用于局部重写） */
  mode?: "latest" | "previous";
  version?: number;
}

export async function loadSnapshot(input: LoadSnapshotInput): Promise<SnapshotLoadDetails> {
  const stage = assertStage(input.stage);
  await getShop(input.shopId);
  if (input.version !== undefined) {
    const row = await prisma.workflowSnapshot.findFirst({
      where: { shopId: input.shopId, stage, version: input.version },
    });
    if (!row) throw new NotFoundError(`该阶段没有第 ${input.version} 版快照`);
    return { snapshotId: row.id, stage, version: row.version, payload: row.payload, createdAt: row.createdAt.toISOString(), rolledBack: false };
  }
  const rows = await prisma.workflowSnapshot.findMany({
    where: { shopId: input.shopId, stage },
    orderBy: { version: "desc" },
    take: 2,
  });
  const target = input.mode === "previous" ? rows[1] : rows[0];
  if (!target) {
    throw new NotFoundError(
      input.mode === "previous" ? "该阶段只有一个版本，没有可回退的上一版" : "该阶段还没有快照，请先完成前一阶段并保存",
    );
  }
  return {
    snapshotId: target.id,
    stage,
    version: target.version,
    payload: target.payload,
    createdAt: target.createdAt.toISOString(),
    rolledBack: input.mode === "previous",
  };
}

export async function listSnapshots(params: { shopId: string; stage?: string; limit?: number }): Promise<SnapshotListDetails> {
  await getShop(params.shopId);
  const stage = params.stage === undefined ? null : assertStage(params.stage);
  const limit = Math.min(Math.max(Math.floor(params.limit ?? DEFAULT_LIST_LIMIT), 1), 50);
  const rows = await prisma.workflowSnapshot.findMany({
    where: { shopId: params.shopId, ...(stage === null ? {} : { stage }) },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: { id: true, stage: true, version: true, createdAt: true, payload: true },
  });
  return {
    stage,
    snapshots: rows.map((row) => ({
      snapshotId: row.id,
      stage: row.stage as SnapshotStage,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      payloadChars: row.payload.length,
    })),
  };
}
