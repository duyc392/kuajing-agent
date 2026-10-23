// 用途：TTS 时间轴单测：按标点切句、字符对齐时间区间、无对齐时按字符比例分配、空文本与零时长边界。
import test from "node:test";
import assert from "node:assert/strict";
import { segmentsFromAlignment } from "@/lib/tts-timeline";

test("有对齐数据：按标点切句并使用字符时间", () => {
  const segments = segmentsFromAlignment(
    {
      characters: ["你", "好", "。", "世", "界"],
      characterStartTimesSeconds: [0, 0.2, 0.4, 0.6, 0.8],
      characterEndTimesSeconds: [0.2, 0.4, 0.6, 0.8, 1],
    },
    1,
    "你好。世界",
  );
  assert.deepEqual(segments, [
    { start: 0, end: 0.6, text: "你好。" },
    { start: 0.6, end: 1, text: "世界" },
  ]);
});

test("无对齐数据：按标点切句并按字符数比例分配时长", () => {
  const segments = segmentsFromAlignment(null, 8, "第一句。第二句！");
  assert.deepEqual(segments, [
    { start: 0, end: 4, text: "第一句" },
    { start: 4, end: 8, text: "第二句" },
  ]);
});

test("无对齐且时长未知：每句至少占 1 秒", () => {
  const segments = segmentsFromAlignment(null, 0, "甲。乙。");
  assert.deepEqual(segments, [
    { start: 0, end: 1, text: "甲" },
    { start: 1, end: 2, text: "乙" },
  ]);
});

test("空文本不产生字幕片段", () => {
  assert.deepEqual(segmentsFromAlignment(null, 10, "  "), []);
});
