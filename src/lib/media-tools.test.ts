// 用途：外部媒体命令封装单测：环境变量覆盖、正常退出、二进制缺失、超时与主动取消；不依赖真实 yt-dlp/ffmpeg。
import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "@/lib/errors";
import { binaryPathOf, runBinaryRaw } from "@/lib/media-tools";

function withBinaryEnv(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const previous = process.env.FFMPEG_BIN;
  if (value === undefined) delete process.env.FFMPEG_BIN;
  else process.env.FFMPEG_BIN = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.FFMPEG_BIN;
    else process.env.FFMPEG_BIN = previous;
  });
}

test("binaryPathOf：环境变量优先于命令名", () => {
  const previous = process.env.FFMPEG_BIN;
  process.env.FFMPEG_BIN = "/custom/ffmpeg";
  try {
    assert.equal(binaryPathOf("ffmpeg"), "/custom/ffmpeg");
  } finally {
    if (previous === undefined) delete process.env.FFMPEG_BIN;
    else process.env.FFMPEG_BIN = previous;
  }
});

test("runBinaryRaw：正常执行并收集 stdout", async () => {
  await withBinaryEnv(process.execPath, async () => {
    const result = await runBinaryRaw("ffmpeg", ["-e", "console.log('ok')"], { timeoutMs: 10_000 });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /ok/);
  });
});

test("runBinaryRaw：命令缺失给出安装指引", async () => {
  await withBinaryEnv("kuajing-missing-binary-xyz", async () => {
    await assert.rejects(
      runBinaryRaw("ffmpeg", [], { timeoutMs: 5_000 }),
      (error: unknown) => error instanceof AppError && error.code === "MEDIA_BINARY_MISSING" && /未安装/.test(error.message),
    );
  });
});

test("runBinaryRaw：超时杀进程并报错", async () => {
  await withBinaryEnv(process.execPath, async () => {
    await assert.rejects(
      runBinaryRaw("ffmpeg", ["-e", "setTimeout(() => {}, 5000)"], { timeoutMs: 50 }),
      (error: unknown) => error instanceof AppError && error.code === "MEDIA_TIMEOUT",
    );
  });
});

test("runBinaryRaw：外部取消杀进程", async () => {
  await withBinaryEnv(process.execPath, async () => {
    const controller = new AbortController();
    const pending = runBinaryRaw("ffmpeg", ["-e", "setTimeout(() => {}, 5000)"], { timeoutMs: 10_000, signal: controller.signal });
    controller.abort();
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof AppError && error.code === "REQUEST_ABORTED",
    );
  });
});
