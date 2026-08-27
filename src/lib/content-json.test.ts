// 用途：content-json 单元测试：JSON 文本字段的安全解析（合法解析、非法降级为空数组、序列化往返）。
import test from "node:test";
import assert from "node:assert/strict";
import { parseNumberArray, parseStringArray, toJsonText } from "@/lib/content-json";

test("parseNumberArray 解析合法的数字数组", () => {
  assert.deepEqual(parseNumberArray("[100,86,74]"), [100, 86, 74]);
});

test("parseNumberArray 对非法 JSON 返回空数组", () => {
  assert.deepEqual(parseNumberArray("{broken"), []);
});

test("parseNumberArray 对非数组 JSON 返回空数组", () => {
  assert.deepEqual(parseNumberArray('{"a":1}'), []);
});

test("parseNumberArray 对元素类型混杂的数组返回空数组", () => {
  assert.deepEqual(parseNumberArray('[1,"2",3]'), []);
  assert.deepEqual(parseNumberArray("[1,null,3]"), []);
  assert.deepEqual(parseNumberArray("[1,NaN,3]"), []);
});

test("parseNumberArray 对空值返回空数组", () => {
  assert.deepEqual(parseNumberArray(null), []);
  assert.deepEqual(parseNumberArray(undefined), []);
  assert.deepEqual(parseNumberArray(""), []);
  assert.deepEqual(parseNumberArray("   "), []);
});

test("parseStringArray 解析合法的字符串数组并对非法内容降级", () => {
  assert.deepEqual(parseStringArray('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseStringArray("[1,2]"), []);
  assert.deepEqual(parseStringArray("not-json"), []);
  assert.deepEqual(parseStringArray(null), []);
});

test("toJsonText 与解析函数往返一致", () => {
  const retention = [100, 86, 74, 66];
  assert.deepEqual(parseNumberArray(toJsonText(retention)), retention);
  const suggestions = ["把卖点提前", "加价格锚点"];
  assert.deepEqual(parseStringArray(toJsonText(suggestions)), suggestions);
});
