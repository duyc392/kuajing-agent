// 用途：视频脚本服务测试（临时 SQLite 库）：创建/列表/详情、空分镜拒绝、跨店铺 404、编辑、历史脏分镜降级为空数组。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

const SHOTS = [{ scene: "车内中控", voiceover: "一拉即收", subtitle: "一拉即收", seconds: 5 }];

test("视频脚本：创建、列表、详情、校验与店铺隔离", async () => {
  const { prisma, url, dbPath } = createTempDb("video-scripts-test");
  process.env.DATABASE_URL = url;
  try {
    const { createScript, getScript, listScripts, updateScript } = await import("@/services/video-scripts.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });
    const product = await prisma.product.create({ data: { shopId: shop.id, name: "卷线充电器" } });

    const created = await createScript({
      shopId: shop.id,
      productId: product.id,
      type: "种草",
      duration: 5,
      hook: "还在为线材打结烦恼？",
      cta: "点击下方小黄车",
      style: null,
      shots: SHOTS,
    });
    assert.deepEqual(created.shots, SHOTS);
    assert.equal(created.version, 1);

    const [summary] = await listScripts(shop.id);
    assert.equal(summary.id, created.id);
    assert.equal(summary.productName, "卷线充电器");

    await assert.rejects(getScript({ id: created.id, shopId: other.id }), /脚本不存在/);
    await assert.rejects(
      createScript({ shopId: shop.id, productId: null, type: "种草", duration: 5, hook: "钩子", cta: "行动", style: null, shots: [] }),
      /分镜不能为空/,
    );
    await assert.rejects(
      createScript({ shopId: other.id, productId: product.id, type: "种草", duration: 5, hook: "钩子", cta: "行动", style: null, shots: SHOTS }),
      /商品不存在/,
    );

    assert.equal((await updateScript({ id: created.id, shopId: shop.id }, { hook: "新钩子" })).hook, "新钩子");
    assert.equal((await updateScript({ id: created.id, shopId: shop.id }, {})).hook, "新钩子");

    await prisma.videoScript.update({ where: { id: created.id }, data: { shots: "not-json" } });
    assert.deepEqual((await getScript({ id: created.id, shopId: shop.id })).shots, []);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
