// 用途：本机访问守卫单测：非回环 Host、跨站 Origin、端口不一致、DNS 重绑定与 Sec-Fetch-Site 白名单。
import test from "node:test";
import assert from "node:assert/strict";
import { crossSiteFetchViolation, localRequestViolation } from "@/lib/request-guard";

test("回环 Host（含端口 / IPv6）允许", () => {
  assert.equal(localRequestViolation("localhost:3000", null), null);
  assert.equal(localRequestViolation("127.0.0.1:3000", "http://127.0.0.1:3000"), null);
  assert.equal(localRequestViolation("[::1]:3000", "http://[::1]:3000"), null);
});

test("非回环 Host 一律拒绝", () => {
  assert.match(localRequestViolation("192.168.1.8:3000", null) ?? "", /只允许本机/);
  assert.match(localRequestViolation("evil.example.com", null) ?? "", /只允许本机/);
});

test("跨站 Origin 与端口不一致拒绝", () => {
  assert.match(localRequestViolation("localhost:3000", "http://evil.example.com") ?? "", /跨站请求/);
  assert.match(localRequestViolation("localhost:3000", "http://localhost:9999") ?? "", /跨站请求/);
  assert.match(localRequestViolation("localhost:3000", "不是 URL") ?? "", /来源不合法/);
});

test("Sec-Fetch-Site 只允许本站/直访/缺失", () => {
  assert.equal(crossSiteFetchViolation(null), null);
  assert.equal(crossSiteFetchViolation("same-origin"), null);
  assert.equal(crossSiteFetchViolation("same-site"), null);
  assert.equal(crossSiteFetchViolation("none"), null);
  assert.match(crossSiteFetchViolation("cross-site") ?? "", /跨站请求/);
});
