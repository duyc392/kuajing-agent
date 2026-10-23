// 用途：SRT 字幕单测：时间格式补零与毫秒、负数归零、空文本跳过、序号连续。
import test from "node:test";
import assert from "node:assert/strict";
import { buildSrt, formatSrtTime } from "@/lib/srt";

test("formatSrtTime：标准格式与毫秒四舍五入", () => {
  assert.equal(formatSrtTime(0), "00:00:00,000");
  assert.equal(formatSrtTime(3661.5), "01:01:01,500");
  assert.equal(formatSrtTime(-3), "00:00:00,000");
});

test("buildSrt：空片段跳过，序号从 1 连续，末尾换行", () => {
  const srt = buildSrt([
    { start: 0, end: 1.5, text: " 你好 " },
    { start: 1.5, end: 2, text: "   " },
    { start: 2, end: 3.25, text: "世界" },
  ]);
  assert.equal(
    srt,
    "1\n00:00:00,000 --> 00:00:01,500\n你好\n\n2\n00:00:02,000 --> 00:00:03,250\n世界\n",
  );
});

test("buildSrt：没有可用片段时只返回换行", () => {
  assert.equal(buildSrt([{ start: 0, end: 1, text: " " }]), "\n");
});
