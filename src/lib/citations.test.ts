// 用途：引文核查单测：逐字命中、空白/大小写容忍、改写成近义句必须失败、空引文报错。
import test from "node:test";
import assert from "node:assert/strict";
import { verifyCitations } from "@/lib/citations";

const CORPUS = "The battery dies after like four hours. 说明书没有英文，用三天就坏了。";

test("引文逐字命中通过", () => {
  const result = verifyCitations([{ quote: "battery dies after like four hours", label: "P1" }], CORPUS);
  assert.equal(result.valid, true);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.problems, []);
});

test("空白与大小写差异不算改写", () => {
  const result = verifyCitations([{ quote: "  The   BATTERY dies" }], CORPUS);
  assert.equal(result.valid, true);
});

test("改写后的近义句必须判为不匹配", () => {
  const result = verifyCitations([{ quote: "battery only lasts a few hours" }], CORPUS);
  assert.equal(result.valid, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].reason, /找不到/);
});

test("空引文单独报错且不计入已检查数", () => {
  const result = verifyCitations([{ quote: "   ", label: "P2" }, { quote: "用三天就坏了", label: "P3" }], CORPUS);
  assert.equal(result.checked, 1);
  assert.equal(result.problems[0].label, "P2");
  assert.match(result.problems[0].reason, /为空/);
});
