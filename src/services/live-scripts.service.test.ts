// 用途：直播脚本服务测试（临时 SQLite 库）：流程结构校验、时长重算、旧格式兼容与店铺隔离。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import type { LiveSegment } from "@/types";

const SEGMENTS: LiveSegment[] = [
  { phase: "开场", minutes: 5, goal: "留住观众", script: "欢迎来到直播间" },
  { phase: "商品讲解", minutes: 10, goal: "讲清卖点", script: "一拉即收" },
  { phase: "互动", minutes: 5, goal: "提升停留", script: "扣 1 抽奖" },
  { phase: "促销", minutes: 5, goal: "促成下单", script: "限时立减" },
];

test("直播脚本：创建、结构校验、时长重算与店铺隔离", async () => {
  const { prisma, url, dbPath } = createTempDb("live-scripts-test");
  process.env.DATABASE_URL = url;
  try {
    const { createLiveScript, getLiveScript, listLiveScripts, updateLiveScript } = await import("@/services/live-scripts.service");
    const shop = await prisma.shop.create({ data: { name: "店铺 A", market: "美国" } });
    const other = await prisma.shop.create({ data: { name: "店铺 B", market: "英国" } });

    const created = await createLiveScript({ shopId: shop.id, duration: 1500, productNames: ["卷线充电器"], segments: SEGMENTS });
    assert.equal(created.segments.length, 4);
    assert.deepEqual(created.productNames, ["卷线充电器"]);
    assert.equal((await listLiveScripts(shop.id))[0].segmentCount, 4);

    await assert.rejects(
      createLiveScript({ shopId: shop.id, duration: 1000, productNames: [], segments: SEGMENTS }),
      /总时长/,
    );
    await assert.rejects(
      createLiveScript({ shopId: shop.id, duration: 0, productNames: [], segments: [] }),
      /至少需要一个阶段/,
    );
    await assert.rejects(
      createLiveScript({ shopId: shop.id, duration: 300, productNames: [], segments: [SEGMENTS[0]] }),
      /缺少/,
    );
    await assert.rejects(
      createLiveScript({ shopId: shop.id, duration: 60, productNames: [], segments: [{ ...SEGMENTS[0], minutes: 0 }, ...SEGMENTS.slice(1)] }),
      /正整数/,
    );

    await assert.rejects(getLiveScript({ id: created.id, shopId: other.id }), /直播脚本不存在/);
    await assert.rejects(updateLiveScript({ id: created.id, shopId: other.id }, { segments: SEGMENTS }), /直播脚本不存在/);

    const updated = await updateLiveScript({ id: created.id, shopId: shop.id }, {
      segments: SEGMENTS.map((segment) => ({ ...segment, minutes: segment.minutes + 1 })),
    });
    assert.equal(updated.duration, 29 * 60, "总时长由阶段分钟数重算");

    const legacy = await prisma.liveScript.create({ data: { shopId: shop.id, duration: 600, productList: "甲、乙，丙", flow: "旧版纯文本" } });
    const legacyView = await getLiveScript({ id: legacy.id, shopId: shop.id });
    assert.deepEqual(legacyView.productNames, ["甲", "乙", "丙"]);
    assert.deepEqual(legacyView.segments, []);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
