// 用途：生成审计测试（临时 SQLite 库）：摘要截断、状态与错误落库、缺 shopId 静默跳过。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

test("生成审计：摘要截断与缺店铺跳过", async () => {
  const { prisma, url, dbPath } = createTempDb("audit-test");
  process.env.DATABASE_URL = url;
  try {
    const { logGeneration } = await import("@/services/audit.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });

    await logGeneration({
      shopId: shop.id,
      type: "chat",
      model: "fake-model",
      prompt: "p".repeat(600),
      output: "o".repeat(600),
      status: "success",
    });
    const [row] = await prisma.generation.findMany({ where: { shopId: shop.id } });
    assert.equal(row.model, "fake-model");
    assert.equal(row.prompt?.length, 501);
    assert.match(row.prompt ?? "", /…$/);
    assert.equal(row.output?.length, 501);
    assert.equal(row.status, "success");

    await logGeneration({ shopId: null, type: "chat", model: "fake-model", prompt: "x", status: "error", error: "失败" });
    assert.equal(await prisma.generation.count(), 1, "缺 shopId 不写库");
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
