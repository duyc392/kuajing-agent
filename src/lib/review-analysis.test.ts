// 用途：评论清洗单测：灌水判定、去重统计、星级分布只统计合法星级。
import test from "node:test";
import assert from "node:assert/strict";
import { filterReviews, isSpamText, ratingCounts } from "@/lib/review-analysis";

test("灌水判定：纯链接/纯表情/过短文本算灌水", () => {
  assert.equal(isSpamText("https://example.com/a"), true);
  assert.equal(isSpamText("👍👍👍"), true);
  assert.equal(isSpamText("good"), true);
  assert.equal(isSpamText("Dies after 4 hours of use, very disappointed"), false);
});

test("去重统计：同文本只保留一条并计数", () => {
  const items = [
    { text: "Dies after 4 hours of use" },
    { text: "dies   after 4 HOURS of use" },
    { text: "Battery is fine but the manual has no English" },
    { text: "https://example.com/x" },
  ];
  const result = filterReviews(items);
  assert.equal(result.kept.length, 2);
  assert.equal(result.deduped, 1);
  assert.equal(result.spamFiltered, 1);
});

test("星级分布只统计 1-5 的整数星级", () => {
  assert.deepEqual(ratingCounts([1, 1, 5, null, 0, 6, 3.4]), { "1": 2, "2": 0, "3": 0, "4": 0, "5": 1 });
});
