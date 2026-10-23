// 用途：切镜节奏单测：切点清洗（越界/过近去重）、每 10 秒切镜数、平均与最长镜头。
import test from "node:test";
import assert from "node:assert/strict";
import { computeCutRhythm, sanitizeCuts } from "@/lib/video-metrics";

test("切点清洗：去掉越界与过近的重复切点", () => {
  const cuts = sanitizeCuts([0, 5, 5.1, 12, 30, -2], 30);
  assert.deepEqual(cuts, [5, 12]);
});

test("节奏指标：30 秒 2 个切点", () => {
  const result = computeCutRhythm({ durationSeconds: 30, cuts: [5, 12] });
  assert.equal(result.cutCount, 2);
  assert.equal(result.cutsPerTenSeconds, 0.67);
  assert.equal(result.averageShotSeconds, 10);
  assert.equal(result.longestShotSeconds, 18);
});

test("没有切点时视为单镜到底", () => {
  const result = computeCutRhythm({ durationSeconds: 15, cuts: [] });
  assert.equal(result.cutCount, 0);
  assert.equal(result.averageShotSeconds, 15);
  assert.equal(result.longestShotSeconds, 15);
});

test("时长未知时不产生除零结果", () => {
  const result = computeCutRhythm({ durationSeconds: 0, cuts: [1, 2] });
  assert.equal(result.cutCount, 0);
  assert.equal(result.cutsPerTenSeconds, 0);
  assert.equal(result.averageShotSeconds, 0);
});
