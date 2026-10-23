// 用途：数字与金额格式化单测：空值/非法输入边界、价格两位小数、K/M/B 与万/亿压缩、百分比占位符。
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCompactMoney,
  formatCompactNumber,
  formatPercent,
  formatPrice,
  parseNullableInt,
  parseNullableNumber,
} from "@/lib/numbers";

test("parseNullableNumber：空串转 null，非法输入抛中文错误", () => {
  assert.equal(parseNullableNumber("", "价格"), null);
  assert.equal(parseNullableNumber("   ", "价格"), null);
  assert.equal(parseNullableNumber(" 12.5 ", "价格"), 12.5);
  assert.throws(() => parseNullableNumber("abc", "价格"), /价格必须是数字/);
  assert.throws(() => parseNullableNumber("Infinity", "价格"), /价格必须是数字/);
});

test("parseNullableInt：非整数拒绝", () => {
  assert.equal(parseNullableInt("3", "库存"), 3);
  assert.equal(parseNullableInt("", "库存"), null);
  assert.throws(() => parseNullableInt("3.2", "库存"), /库存必须是整数/);
});

test("formatPrice：null/NaN 占位，正常值固定两位小数", () => {
  assert.equal(formatPrice(null), "—");
  assert.equal(formatPrice(Number.NaN), "—");
  assert.equal(formatPrice(3), "3.00");
  assert.equal(formatPrice(3.456), "3.46");
});

test("formatCompactMoney：K/M/B 分档", () => {
  assert.equal(formatCompactMoney(999), "$999");
  assert.equal(formatCompactMoney(1500), "$1.5K");
  assert.equal(formatCompactMoney(1_200_000), "$1.20M");
  assert.equal(formatCompactMoney(1_230_000_000), "$1.23B");
  assert.equal(formatCompactMoney(Number.NaN), "—");
});

test("formatCompactNumber：万/亿分档", () => {
  assert.equal(formatCompactNumber(9999), "9999");
  assert.equal(formatCompactNumber(12000), "1.2万");
  assert.equal(formatCompactNumber(120_000_000), "1.20亿");
  assert.equal(formatCompactNumber(Number.POSITIVE_INFINITY), "—");
});

test("formatPercent：保留一位小数", () => {
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(12.345), "12.3%");
});
