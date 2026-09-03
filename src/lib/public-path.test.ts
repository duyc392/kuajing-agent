// 用途：resolvePublicDiskPath 单元测试——合法路径解析、穿越路径拒绝、边界形态。
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { resolvePublicDiskPath } from "@/lib/public-path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

test("合法的生成图片相对路径正常解析到 public 目录内", () => {
  const resolved = resolvePublicDiskPath("/generated/abc.png");
  assert.equal(resolved, path.join(PUBLIC_DIR, "generated", "abc.png"));
});

test("不带前导斜杠的相对路径同样允许", () => {
  const resolved = resolvePublicDiskPath("generated/abc.png");
  assert.equal(resolved, path.join(PUBLIC_DIR, "generated", "abc.png"));
});

test("路径穿越到 public 目录之外时返回 null", () => {
  assert.equal(resolvePublicDiskPath("../../secret.txt"), null);
  assert.equal(resolvePublicDiskPath("generated/../../secret.txt"), null);
  assert.equal(resolvePublicDiskPath("/../outside.png"), null);
});

test("空路径视为非法记录返回 null", () => {
  assert.equal(resolvePublicDiskPath(""), null);
  assert.equal(resolvePublicDiskPath("/"), null);
});

test("包含空字节的路径直接拒绝", () => {
  assert.equal(resolvePublicDiskPath("generated/a\0b.png"), null);
});

test("伪造同前缀目录（public-evil）不误判为合法", () => {
  // path.resolve 会把 "../public-evil/x.png" 解析到 public 的兄弟目录，必须被拒绝
  assert.equal(resolvePublicDiskPath("../public-evil/x.png"), null);
});
