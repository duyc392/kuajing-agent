// 用途：异步任务查询工具单测：完成任务文本、未知任务 404。
import test from "node:test";
import assert from "node:assert/strict";
import { createGetAsyncTaskTool } from "@/agent/tools/task";
import { firstText } from "@/agent/tools/tool-test-utils";
import { startTask } from "@/services/async-task.service";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("get_async_task：完成任务返回 details 与可读文本", async () => {
  const { taskId } = startTask("demo", async () => {
    await wait(10);
    return { ok: true };
  });
  await wait(40);
  const tool = createGetAsyncTaskTool();
  const result = await tool.execute("call-1", { taskId });
  assert.equal(result.details.status, "done");
  assert.deepEqual(result.details.result, { ok: true });
  assert.match(firstText(result.content), /任务已完成/);
});

test("get_async_task：未知任务抛 NotFoundError", async () => {
  const tool = createGetAsyncTaskTool();
  await assert.rejects(tool.execute("call-1", { taskId: "missing-task-id" }), /任务不存在或已过期/);
});
