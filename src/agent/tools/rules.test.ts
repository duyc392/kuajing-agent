// 用途：Agent 分层架构守护：工具层禁止直接访问 prisma 或调用模型；内置技能文件禁止执行逻辑与外部 IO。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const TOOLS_DIR = path.join(process.cwd(), "src", "agent", "tools");
const SKILLS_DIR = path.join(process.cwd(), "src", "agent", "skills");

function sourceFiles(dir: string, skip: (name: string) => boolean = () => false): Array<{ name: string; text: string }> {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !skip(name))
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf-8") }));
}

test("工具层不得出现 prisma 查询或模型调用", () => {
  for (const file of sourceFiles(TOOLS_DIR)) {
    assert.doesNotMatch(file.text, /prisma\./, `${file.name} 直接访问了 prisma`);
    assert.doesNotMatch(file.text, /generateText/, `${file.name} 调用了模型`);
  }
});

test("内置技能文件不得包含执行逻辑或外部 IO", () => {
  for (const file of sourceFiles(SKILLS_DIR, (name) => name === "index.ts")) {
    assert.doesNotMatch(file.text, /\bexecute\s*\(/, `${file.name} 出现 execute`);
    assert.doesNotMatch(file.text, /prisma\./, `${file.name} 访问了 prisma`);
    assert.doesNotMatch(file.text, /\bfetch\s*\(/, `${file.name} 发起网络请求`);
    assert.doesNotMatch(file.text, /from\s+["']@\/services\//, `${file.name} 依赖服务层`);
  }
});
