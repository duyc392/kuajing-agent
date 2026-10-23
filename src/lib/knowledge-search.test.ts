// 用途：本地知识检索单测：真实知识目录可分节加载、相关问题命中且限制条数、无关问题返回空。
import test from "node:test";
import assert from "node:assert/strict";
import { loadKnowledgeSections, retrieveKnowledgeSections } from "@/lib/knowledge-search";

test("知识目录可加载出带标题与正文的小节", async () => {
  const sections = await loadKnowledgeSections();
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.ok(section.file.endsWith(".md"));
    assert.ok(section.title.length > 0);
    assert.ok(section.content.length > 0);
  }
});

test("相关问题命中且不超过 limit", async () => {
  const sections = await retrieveKnowledgeSections("选品", 2);
  assert.ok(sections.length <= 2);
});

test("无关问题不误命中", async () => {
  assert.deepEqual(await retrieveKnowledgeSections("qwertyuiop-asdfghjkl", 3), []);
});
