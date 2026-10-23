// 用途：阶段快照服务测试（临时库）：版本递增、按 stage 隔离、previous 回退一版、跨店铺不可读、非法 payload 拒写。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

test("阶段快照：版本递增、回退上一版与店铺隔离", async () => {
  const { prisma, url, dbPath } = createTempDb("snapshot-test");
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.createMany({ data: [
      { id: "s-a", name: "店铺 A", market: "美国" },
      { id: "s-b", name: "店铺 B", market: "美国" },
    ] });
    const { saveSnapshot, loadSnapshot, listSnapshots } = await import("@/services/snapshot.service");

    const v1 = await saveSnapshot({ shopId: "s-a", stage: "audience-insights", payload: JSON.stringify({ pains: ["P1"] }) });
    const v2 = await saveSnapshot({ shopId: "s-a", stage: "audience-insights", payload: JSON.stringify({ pains: ["P1", "P2"] }) });
    assert.equal(v1.version, 1);
    assert.equal(v2.version, 2);

    const latest = await loadSnapshot({ shopId: "s-a", stage: "audience-insights" });
    assert.equal(latest.version, 2);
    assert.equal(latest.rolledBack, false);

    const previous = await loadSnapshot({ shopId: "s-a", stage: "audience-insights", mode: "previous" });
    assert.equal(previous.version, 1);
    assert.equal(previous.rolledBack, true);
    assert.deepEqual(JSON.parse(previous.payload), { pains: ["P1"] });

    // 跨店铺不可读：s-b 该阶段没有任何快照。
    await assert.rejects(loadSnapshot({ shopId: "s-b", stage: "audience-insights" }), /还没有快照/);

    const list = await listSnapshots({ shopId: "s-a", stage: "audience-insights" });
    assert.equal(list.snapshots.length, 2);
    assert.equal(list.snapshots[0].version, 2);
    assert.ok(list.snapshots[0].payloadChars > 0);

    // 非法输入拒写。
    await assert.rejects(saveSnapshot({ shopId: "s-a", stage: "audience-insights", payload: "not-json" }), /合法 JSON/);
    await assert.rejects(saveSnapshot({ shopId: "s-a", stage: "unknown-stage", payload: "{}" }), /未知的阶段/);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await removeTempDb(dbPath);
  }
});
