// 用途：异步任务查询工具：长任务（下载/转写/抽帧/ComfyUI/TTS）统一用它拿结果。
// 只读任务状态，不触发任何业务逻辑。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { getTask } from "@/services/async-task.service";
import { NotFoundError } from "@/lib/errors";
import type { AsyncTaskSnapshot } from "@/types";

const taskSchema = Type.Object({
  taskId: Type.String({ description: "发起长任务时返回的 taskId", minLength: 8, maxLength: 64, pattern: "\\S" }),
});

type TaskParams = Static<typeof taskSchema>;

export function createGetAsyncTaskTool(): AgentTool<typeof taskSchema, AsyncTaskSnapshot> {
  return {
    name: "get_async_task",
    label: "查询后台任务",
    description:
      "查询长任务状态：running 表示还在跑（稍后再查），done 时 result 里有最终产物，error 时 error 是失败原因。任务结果保留 30 分钟。",
    parameters: taskSchema,
    async execute(_toolCallId, params: TaskParams): Promise<AgentToolResult<AsyncTaskSnapshot>> {
      const task = getTask(params.taskId);
      if (!task) throw new NotFoundError("任务不存在或已过期，请重新发起");
      const text = task.status === "running"
        ? `任务仍在进行中（${task.kind}），请稍后再查。`
        : task.status === "done"
          ? `任务已完成（${task.kind}），结果见 details.result。`
          : `任务失败（${task.kind}）：${task.error ?? "未知错误"}`;
      return { content: [{ type: "text", text }], details: task };
    },
  };
}
