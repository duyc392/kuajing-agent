// 用途：文本相似度单测：去空白/小写、中文 bigram、疑问词过滤、覆盖率分数与空问题边界。
import test from "node:test";
import assert from "node:assert/strict";
import { bigrams, meaningfulGrams, scoreText } from "@/lib/text-match";

test("bigrams：去空白、转小写、按两字切片", () => {
  assert.deepEqual([...bigrams("AB c")].sort(), ["ab", "bc"]);
  assert.deepEqual([...bigrams("充电器")].sort(), ["充电", "电器"]);
  assert.equal(bigrams("a").size, 0);
});

test("meaningfulGrams：过滤疑问/请求类停用片段", () => {
  const grams = meaningfulGrams("如何选品");
  assert.equal(grams.has("如何"), false);
  assert.equal(grams.has("何选"), true);
  assert.equal(grams.has("选品"), true);
});

test("scoreText：完全相同为 1，无重叠为 0", () => {
  assert.equal(scoreText("充电器", "充电器"), 1);
  assert.equal(scoreText("充电器", "完全无关的内容"), 0);
  assert.equal(scoreText("如何", "如何"), 0, "全是停用词时返回 0");
  assert.equal(scoreText("", "任意内容"), 0);
});

test("scoreText：部分命中按问题关键词比例计分", () => {
  assert.equal(scoreText("续航差", "续航很差"), 0.5);
});
