// 用途：推进测品事务测试（临时 SQLite 库）：成功推进后四张表数据齐全（人民币价格合同）、固定佣金不可绕过、
// 重复推进拒绝、负利拒绝、定制脚本校验（秒数不一致拒绝）、内置脚本统一校验。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import { buildManualCandidate } from "@/lib/selection-manual-candidate";
import { round2 } from "@/lib/selection-finance";
import { USD_TO_RMB } from "@/config/selection";
import type { SelectionDraftScript } from "@/types";

test("推进测品：事务落库、人民币价格合同、固定佣金、去重与校验拒绝", async () => {
  const { prisma, url, dbPath } = createTempDb("selection-promo-test");
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    const { promoteToTesting, TESTING_STATUS, SCRIPTS_CREATED_COUNT } = await import("@/services/selection-promotion.service");

    const candidate = buildManualCandidate({ name: "测试自动卷线充电器", category: "3C数码", sellingPrice: 24.99, costRmb: 15, weightGrams: 180 }, "US");

    // 定制脚本：套用 20 秒分镜（4 段），时长一致。注意：服务端佣金固定 15%，候选自带的 mock 佣金率不生效。
    const custom: SelectionDraftScript = {
      title: "种草型 · 钩子（20 秒）",
      angleType: "comparison",
      durationSeconds: 20,
      sections: [
        { orderIndex: 1, sceneName: "镜头 1", durationSeconds: 3, visualCue: "车内电线打结", spokenText: "Tangled cords driving you crazy?" },
        { orderIndex: 2, sceneName: "镜头 2", durationSeconds: 5, visualCue: "拿出充电器", spokenText: "Switch to this 3-in-1 charger." },
        { orderIndex: 3, sceneName: "镜头 3", durationSeconds: 8, visualCue: "一键回弹", spokenText: "One click retracts instantly." },
        { orderIndex: 4, sceneName: "镜头 4", durationSeconds: 4, visualCue: "小黄车", spokenText: "Tap below for the flash sale!" },
      ],
    };

    const promoted = await promoteToTesting({ shopId: "s-a", candidate, customDraftScript: custom });
    assert.equal(promoted.testingStatus, TESTING_STATUS);
    assert.equal(promoted.scriptsCreatedCount, SCRIPTS_CREATED_COUNT);

    const product = await prisma.product.findUnique({ where: { id: promoted.productId } });
    assert.ok(product);
    assert.equal(product.shopId, "s-a");
    assert.equal(product.testingStatus, TESTING_STATUS);
    // 价格契约：候选计算域为美元，入库折人民币（商品页按人民币展示）。
    assert.equal(product.price, round2(24.99 * USD_TO_RMB), "Product.price 为人民币预算值");

    assert.equal(await prisma.productDna.count({ where: { productId: promoted.productId } }), 1);
    const scripts = await prisma.videoScript.findMany({ where: { productId: promoted.productId }, orderBy: { createdAt: "asc" } });
    assert.equal(scripts.length, SCRIPTS_CREATED_COUNT);
    assert.equal(scripts[0].type, "对比", "定制脚本替换第一篇（comparison → 对比）");
    assert.ok(scripts[0].shots.includes("One click retracts instantly."));
    assert.equal(scripts[0].duration, 20);

    // 主脚本镜头数 → 拍摄需求。
    const primaryShots = JSON.parse(scripts[0].shots) as Array<{ seconds: number }>;
    const shotRows = await prisma.shotRequirement.findMany({ where: { productId: promoted.productId }, orderBy: { shotCode: "asc" } });
    assert.equal(shotRows.length, primaryShots.length);
    assert.equal(shotRows[0].shotCode, "S01");
    assert.equal(shotRows[0].shopId, "s-a");

    // 重复推进同一候选 → 冲突拒绝（前端防抖 + 沙盒移除 + 事务内校验的三层防御之第三层）。
    await assert.rejects(
      promoteToTesting({ shopId: "s-a", candidate }),
      (error: Error) => error instanceof Error && error.message.includes("已在测品池"),
    );

    // 负利候选 → 拒绝推进（且固定佣金下不能豁免）。
    const loss = buildManualCandidate({ name: "测试亏损商品", category: "美妆个护", sellingPrice: 9.99, costRmb: 999, weightGrams: 300 }, "US");
    await assert.rejects(
      promoteToTesting({ shopId: "s-a", candidate: loss }),
      (error: Error) => error instanceof Error && error.message.includes("利润已为负"),
    );

    // 客户端伪造佣金率 0 也不能绕过：该候选按 0% 佣金为正利、按固定 15% 为负利 → 服务端拒绝即证明固定佣金生效。
    const bypass = buildManualCandidate({ name: "佣金绕过商品", category: "家居厨房", sellingPrice: 10, costRmb: 45, weightGrams: 50 }, "US");
    await assert.rejects(
      promoteToTesting({ shopId: "s-a", candidate: { ...bypass, commissionRate: 0 } }),
      (error: Error) => error instanceof Error && error.message.includes("利润已为负"),
    );

    // 定制脚本秒数与总时长不一致 → 拒绝。
    const brokenCustom: SelectionDraftScript = { ...custom, durationSeconds: 21 };
    const fresh = buildManualCandidate({ name: "秒数不符商品", category: "家居厨房", sellingPrice: 19.99, costRmb: 8, weightGrams: 100 }, "US");
    await assert.rejects(
      promoteToTesting({ shopId: "s-a", candidate: fresh, customDraftScript: brokenCustom }),
      (error: Error) => error instanceof Error && error.message.includes("总时长"),
    );

    // 内置脚本秒数被篡改（候选自带脚本与时长不一致）→ 统一校验拒绝。
    const tampered = fresh.builtInScripts[0];
    const badBuiltIn = buildManualCandidate({ name: "内置脚本篡改", category: "家居厨房", sellingPrice: 19.99, costRmb: 8, weightGrams: 100 }, "US");
    badBuiltIn.builtInScripts[0] = { ...tampered, shots: tampered.shots.map((shot, index) => (index === 0 ? { ...shot, seconds: 4 } : shot)) };
    await assert.rejects(
      promoteToTesting({ shopId: "s-a", candidate: badBuiltIn }),
      (error: Error) => error instanceof Error && error.message.includes("分镜秒数总和"),
    );

    // 内置脚本不足 3 篇（客户端只带 1 篇）→ 差异化补齐到 3 篇，绝不复制第一篇凑数。
    const sparse = buildManualCandidate({ name: "内置脚本不足商品", category: "家居厨房", sellingPrice: 19.99, costRmb: 8, weightGrams: 100 }, "US");
    sparse.builtInScripts = [sparse.builtInScripts[0]];
    const sparsePromoted = await promoteToTesting({ shopId: "s-a", candidate: sparse });
    assert.equal(sparsePromoted.scriptsCreatedCount, SCRIPTS_CREATED_COUNT);
    const sparseScripts = await prisma.videoScript.findMany({ where: { productId: sparsePromoted.productId } });
    assert.equal(new Set(sparseScripts.map((row) => row.type)).size, 3, "补齐脚本类型差异化（种草/教程/开箱轮转）");

    // 失败场景后无残留数据（事务原子性旁证：所有拒绝均发生在进入/提交事务之前）。
    const all = await prisma.product.findMany({ where: { shopId: "s-a" } });
    assert.equal(all.length, 2, "只有推进成功的 2 款商品落库");
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
