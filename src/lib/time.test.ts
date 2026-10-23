// 用途：时间显示单测：相对时间的分钟/小时/昨天/天/日期分档，直播时长按分钟四舍五入。
import test from "node:test";
import assert from "node:assert/strict";
import { formatMinutes, formatRelativeTime } from "@/lib/time";

const NOW = new Date("2026-01-10T12:00:00.000Z");

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

test("formatRelativeTime：刚刚/分钟/小时/昨天/天前", () => {
  assert.equal(formatRelativeTime(ago(30_000), NOW), "刚刚");
  assert.equal(formatRelativeTime(ago(5 * 60_000), NOW), "5 分钟前");
  assert.equal(formatRelativeTime(ago(2 * 3_600_000), NOW), "2 小时前");
  assert.equal(formatRelativeTime(ago(24 * 3_600_000), NOW), "昨天");
  assert.equal(formatRelativeTime(ago(3 * 24 * 3_600_000), NOW), "3 天前");
});

test("formatRelativeTime：超过 7 天回落到本地日期", () => {
  const date = new Date(NOW.getTime() - 10 * 24 * 3_600_000);
  assert.equal(formatRelativeTime(date.toISOString(), NOW), date.toLocaleDateString("zh-CN"));
});

test("formatMinutes：秒转分钟并四舍五入", () => {
  assert.equal(formatMinutes(0), "0 分钟");
  assert.equal(formatMinutes(60), "1 分钟");
  assert.equal(formatMinutes(90), "2 分钟");
});
