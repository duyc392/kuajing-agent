// 用途：接口地址校验单测：https 强制、本机回环 http 豁免、账号密码与非法协议拒绝。
import test from "node:test";
import assert from "node:assert/strict";
import { baseUrlViolation, originOf } from "@/lib/urls";

test("originOf 取协议与主机", () => {
  assert.equal(originOf("https://api.example.com/v1/chat"), "https://api.example.com");
  assert.equal(originOf("http://localhost:3000/api"), "http://localhost:3000");
});

test("https 地址一律允许", () => {
  assert.equal(baseUrlViolation("https://api.example.com/v1"), null);
});

test("本机回环允许 http", () => {
  assert.equal(baseUrlViolation("http://localhost:3000/v1"), null);
  assert.equal(baseUrlViolation("http://127.0.0.1:8080"), null);
  assert.equal(baseUrlViolation("http://[::1]:8080"), null);
});

test("外部 http、非法协议与账号密码被拒绝", () => {
  assert.match(baseUrlViolation("http://api.example.com") ?? "", /必须是 https/);
  assert.match(baseUrlViolation("ftp://api.example.com") ?? "", /必须是 https/);
  assert.match(baseUrlViolation("https://user:pass@api.example.com") ?? "", /不能包含账号密码/);
  assert.match(baseUrlViolation("not a url") ?? "", /格式不正确/);
});
