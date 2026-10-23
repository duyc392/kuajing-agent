// 用途：异步任务注册表单测（进程内）：running → done、失败记录错误、未知任务返回 null。
import test from "node:test";
import assert from "node:assert/strict";
import { getTask, startTask } from "@/services/async-task.service";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("成功任务：先 running，完成后结果可见", async () => {
  const { taskId, status } = startTask("demo", async () => {
    await wait(20);
    return { ok: true };
  });
  assert.equal(status, "running");
  assert.equal(getTask(taskId)?.status, "running");
  await wait(60);
  const done = getTask(taskId);
  assert.equal(done?.status, "done");
  assert.deepEqual(done?.result, { ok: true });
  assert.ok(done?.finishedAt);
});

test("失败任务：记录错误信息且不抛出", async () => {
  const { taskId } = startTask("demo", async () => {
    await wait(10);
    throw new Error("下载失败");
  });
  await wait(50);
  const failed = getTask(taskId);
  assert.equal(failed?.status, "error");
  assert.equal(failed?.error, "下载失败");
});

test("未知 taskId 返回 null", () => {
  assert.equal(getTask("missing-task"), null);
});
