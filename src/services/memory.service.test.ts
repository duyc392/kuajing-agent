// 用途：长期记忆服务测试（临时 SQLite 库）：批量写入过滤/去重、列表、编辑校验、删除与跨店铺 404。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import type { ExtractedMemoryCandidate } from "@/types";

test("长期记忆：批量写入、去重、编辑、删除与店铺隔离", async () => {
  const { prisma, url, dbPath } = createTempDb("memory-test");
  process.env.DATABASE_URL = url;
  try {
    const { addMemories, deleteMemory, listMemories, updateMemory } = await import("@/services/memory.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });

    const candidates: ExtractedMemoryCandidate[] = [
      { category: "店铺定位", content: "专注 3C 配件" },
      { category: "目标人群", content: "通勤女性" },
      { category: "店铺定位", content: "专注 3C 配件" },
      { category: "运营习惯", content: "   " },
    ];
    candidates.push({ category: "不存在的分类", content: "x" } as unknown as ExtractedMemoryCandidate);
    const added = await addMemories(shop.id, candidates);
    assert.equal(added.length, 2, "重复、空白、非法分类都不写入");

    const listed = await listMemories(shop.id);
    assert.deepEqual(listed.map((row) => row.category), ["店铺定位", "目标人群"]);

    const target = listed.find((row) => row.category === "店铺定位");
    assert.ok(target);
    const updated = await updateMemory({ id: target.id, shopId: shop.id }, { content: "专注手机配件", category: "内容偏好" });
    assert.equal(updated.content, "专注手机配件");
    assert.equal(updated.category, "内容偏好");

    await assert.rejects(updateMemory({ id: target.id, shopId: shop.id }, { content: "  " }), /不能为空/);
    await assert.rejects(updateMemory({ id: target.id, shopId: shop.id }, {}), /至少提交一个修改字段/);
    await assert.rejects(updateMemory({ id: target.id, shopId: other.id }, { content: "越权" }), /记忆条目不存在/);
    await assert.rejects(deleteMemory({ id: target.id, shopId: other.id }), /记忆条目不存在/);

    assert.deepEqual(await addMemories(shop.id, [{ category: "内容偏好", content: "专注手机配件" }]), [], "重复内容不新增");
    await deleteMemory({ id: target.id, shopId: shop.id });
    await assert.rejects(deleteMemory({ id: target.id, shopId: shop.id }), /记忆条目不存在/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
