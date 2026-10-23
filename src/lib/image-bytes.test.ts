// 用途：图片字节校验单测：PNG/JPEG/WebP 魔数识别、未知格式拒绝、MIME 与扩展名映射。
import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_MAX_BYTES, detectImageMime, extensionOfMime, mimeOfExtension } from "@/lib/image-bytes";

function bytes(values: number[], pad = 12): Buffer {
  return Buffer.from([...values, ...new Array(Math.max(0, pad - values.length)).fill(0)]);
}

test("detectImageMime：三种允许格式的魔数", () => {
  assert.equal(detectImageMime(bytes([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(detectImageMime(bytes([0xff, 0xd8, 0xff])), "image/jpeg");
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
  assert.equal(detectImageMime(webp), "image/webp");
});

test("detectImageMime：过短或未知格式返回 null", () => {
  assert.equal(detectImageMime(Buffer.from([0x89, 0x50])), null);
  assert.equal(detectImageMime(Buffer.from("<html><body>")), null);
});

test("MIME 与扩展名映射", () => {
  assert.equal(extensionOfMime("image/png"), "png");
  assert.equal(extensionOfMime("image/jpeg"), "jpg");
  assert.equal(extensionOfMime("image/webp"), "webp");
  assert.equal(mimeOfExtension("/tmp/a.JPG"), "image/jpeg");
  assert.equal(mimeOfExtension("/tmp/a.webp"), "image/webp");
  assert.equal(mimeOfExtension("/tmp/a.png"), "image/png");
  assert.equal(IMAGE_MAX_BYTES, 10 * 1024 * 1024);
});
