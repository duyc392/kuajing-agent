// 用途：素材需求服务层测试（P01/P12/P13 守护，临时 SQLite 库）：
// 分镜合并生成后落库、重复调用幂等、新脚本补新镜头增量同步、update 跨店铺拒绝、三态循环词表。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

const shotsOf = (scenes: string[]) => JSON.stringify(scenes.map((scene) => ({ scene, voiceover: "v", subtitle: "s", seconds: 5 })));

test("素材需求：生成后落库且幂等、新脚本增量同步、跨店铺更新拒绝", async () => {
  const { prisma, url, dbPath } = createTempDb("shots-test");
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    await prisma.shop.create({ data: { id: "s-b", name: "店铺 B", market: "印尼" } });
    await prisma.product.create({ data: { id: "p-a", shopId: "s-a", name: "智能去黑头仪" } });
    await prisma.videoScript.create({
      data: { id: "sc-1", shopId: "s-a", productId: "p-a", type: "种草", duration: 15, hook: "h", cta: "c", shots: shotsOf(["手指屏幕演示", "产品特写"]) },
    });

    const service = await import("@/services/shot-requirements.service");

    // GET 对应的纯读服务不触发写入。
    assert.equal((await service.listShotRequirements("s-a", "p-a")).length, 0);

    // 首次显式同步：无记录时从脚本分镜合并生成。
    const first = await service.syncShotRequirementsForProduct("s-a", "p-a");
    assert.equal(first.length, 2, "两个分镜生成两条镜头");
    assert.equal(first[0].shotCode, "S01");
    assert.equal(first[1].shotCode, "S02");
    assert.equal(first[0].status, "待拍摄");

    // 并发幂等：两个同步同时调用，不重复插入。
    const [second, concurrent] = await Promise.all([
      service.syncShotRequirementsForProduct("s-a", "p-a"),
      service.syncShotRequirementsForProduct("s-a", "p-a"),
    ]);
    assert.equal(second.length, 2, "重复调用不新增记录");
    assert.equal(concurrent.length, 2, "并发同步不重复插入");

    // 增量同步：新脚本新增场景 → 补 1 条新镜头。
    await prisma.videoScript.create({
      data: { id: "sc-2", shopId: "s-a", productId: "p-a", type: "教程", duration: 20, hook: "h2", cta: "c2", shots: shotsOf(["手指屏幕演示", "油渍对比"]) },
    });
    const third = await service.syncShotRequirementsForProduct("s-a", "p-a");
    assert.equal(third.length, 3, "新场景油渍对比补入，重复场景不新增");
    assert.equal(third.find((item) => item.scene === "油渍对比")?.shotCode, "S03");

    // 共用脚本引用合并：第一镜头被两个脚本共用。
    const finger = third.find((item) => item.scene === "手指屏幕演示");
    assert.ok(finger);
    assert.deepEqual(finger.scriptIds.sort(), ["sc-1", "sc-2"]);

    // 跨店铺更新：店铺 B 无权更新店铺 A 的镜头（铁律 404）。
    const shotId = third[0].id;
    await assert.rejects(() => service.updateShotRequirementStatus("s-b", shotId, "拍摄中"), /镜头不存在/);

    // 三态循环：同店更新成功，状态进入拍摄中；再更新为已归档复用。
    const updated = await service.updateShotRequirementStatus("s-a", shotId, "拍摄中");
    assert.equal(updated.status, "拍摄中");
    const archived = await service.updateShotRequirementStatus("s-a", shotId, "已归档复用");
    assert.equal(archived.status, "已归档复用");

    // 删除脚本后：共用引用收缩，所有脚本都不用的场景记录被移除。
    await prisma.videoScript.delete({ where: { id: "sc-2" } });
    const afterDelete = await service.syncShotRequirementsForProduct("s-a", "p-a");
    assert.equal(afterDelete.length, 2, "油渍对比随最后一个关联脚本删除而清理");
    assert.deepEqual(afterDelete.find((item) => item.scene === "手指屏幕演示")?.scriptIds, ["sc-1"]);
  } finally {
    await prisma.$disconnect();
    // 动态 import 的服务层经 @/lib/db 持有单例连接，必须一并断开，否则 SQLite 文件句柄不释放、临时库删不掉。
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    await removeTempDb(dbPath);
    delete process.env.DATABASE_URL;
  }
});
