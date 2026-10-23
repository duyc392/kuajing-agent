// 用途：异步任务注册表（进程内）：把视频下载/转写/抽帧、TTS 这类慢操作放到后台执行，
// 工具立刻返回 taskId，主 Agent 用 get_async_task 轮询。结果有过期清理，避免内存无限增长。
// 说明：任务表是进程内内存态（本地单机部署场景足够）；重启进程后未完成任务会丢失，需重新发起。
import { randomUUID } from "crypto";
import { ASYNC_TASK_DEFAULTS } from "@/config/integrations";
import type { AsyncTaskSnapshot, AsyncTaskStatus } from "@/types";

interface TaskRecord {
  taskId: string;
  kind: string;
  status: AsyncTaskStatus;
  result?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const tasks = new Map<string, TaskRecord>();

function toSnapshot(record: TaskRecord): AsyncTaskSnapshot {
  return {
    taskId: record.taskId,
    kind: record.kind,
    status: record.status,
    result: record.result,
    error: record.error,
    startedAt: new Date(record.startedAt).toISOString(),
    finishedAt: record.finishedAt === undefined ? undefined : new Date(record.finishedAt).toISOString(),
  };
}

function cleanup(): void {
  const deadline = Date.now() - ASYNC_TASK_DEFAULTS.ttlMs;
  for (const [taskId, record] of tasks) {
    const stamp = record.finishedAt ?? record.startedAt;
    if (stamp < deadline) tasks.delete(taskId);
  }
}

// 启动任务：异常只记在任务记录里，不抛出（后台任务没有调用方可以接住）。
export function startTask<T>(kind: string, run: () => Promise<T>): { taskId: string; status: AsyncTaskStatus } {
  cleanup();
  const taskId = randomUUID();
  const record: TaskRecord = { taskId, kind, status: "running", startedAt: Date.now() };
  tasks.set(taskId, record);
  void run()
    .then((result) => {
      record.status = "done";
      record.result = result;
      record.finishedAt = Date.now();
    })
    .catch((error: unknown) => {
      console.error(`[async-task] ${kind} 任务失败:`, error);
      record.status = "error";
      record.error = error instanceof Error ? error.message : "任务执行失败，请重试";
      record.finishedAt = Date.now();
    });
  return { taskId, status: "running" };
}

export function getTask(taskId: string): AsyncTaskSnapshot | null {
  cleanup();
  const record = tasks.get(taskId);
  return record ? toSnapshot(record) : null;
}
