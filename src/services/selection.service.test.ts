// 用途：选品服务测试（临时 SQLite 库）：runSelection 严格过滤与市场差异、23 列字段完整、财务公式抽查、视频透视结构、手动添加候选合法。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import { computeSelectionFinance, round2 } from "@/lib/selection-finance";
import { buildManualCandidate } from "@/lib/selection-manual-candidate";
import { calcShippingFee, mockVideoUrlOf, PLATFORM_FEE_RATE, CREATOR_COMMISSION_RATE, REFUND_RESERVE_RATE, USD_TO_RMB } from "@/config/selection";

test("选品运行：店铺校验、过滤合规、严格毛利率、三市场产出与财务抽查", async () => {
  const { prisma, url, dbPath } = createTempDb("selection-test");
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    const { runSelection, getVideoInsight } = await import("@/services/selection.service");

    const baseFilters = {
      targetCategory: "Beauty",
      priceRange: { min: 20, max: 40 },
      maxWeightGrams: 500,
      isProhibitedGoodsExcluded: true,
    };

    // US：价格段 20-40 的美妆品类应产出候选，且全部满足毛利率下限与硬过滤。
    const us = await runSelection({ shopId: "s-a", filters: { ...baseFilters, targetRegion: "US", minMarginRate: 0.45 } });
    assert.ok(us.candidates.length >= 15, "US 至少 15 款候选");
    assert.ok(us.candidates.length <= 20, "候选数量不超过 20");
    assert.equal(typeof us.generatedAt, "string");
    for (const candidate of us.candidates) {
      if (candidate.name.includes("LED")) assert.fail(`禁电禁液应排除：${candidate.name}`);
      assert.equal(Number.isFinite(candidate.netProfit), true);
      assert.equal(Number.isFinite(candidate.breakevenRoas), true);
      assert.ok(candidate.netMarginRate >= 0.45, "严格过滤：不出现低于用户要求毛利率的候选");
      assert.ok(["建议测品", "候选保留", "已淘汰"].includes(candidate.status));
      assert.equal(candidate.sellingPrice >= 20 && candidate.sellingPrice <= 40, true);
      assert.equal(candidate.weightGrams <= 500, true);
      assert.ok(candidate.dna.targetPersona.length > 0);
      assert.equal(candidate.builtInScripts.length, 3, "每款候选带 3 篇内置脚本草稿");
      for (const script of candidate.builtInScripts) {
        assert.equal(script.shots.reduce((sum, shot) => sum + shot.seconds, 0), script.duration, "脚本分镜秒数总和严格等于时长");
      }
    }

    // UK / ID：模拟运费标注且候选可正常产出（ID 曾因运费币种错误清零）。
    const uk = await runSelection({ shopId: "s-a", filters: { ...baseFilters, targetRegion: "UK", minMarginRate: 0.45 } });
    assert.ok(uk.candidates.length >= 15, "UK 正常产出候选");
    assert.equal(uk.candidates[0].shippingSimulated, true, "UK 运费带模拟标记");
    const id = await runSelection({ shopId: "s-a", filters: { ...baseFilters, targetRegion: "ID", minMarginRate: 0.45 } });
    assert.ok(id.candidates.length >= 15, "ID 正常产出候选（修复运费币种混用后）");
    assert.equal(id.candidates[0].shippingSimulated, true, "ID 运费带模拟标记");
    assert.ok(id.candidates[0].shippingFee < 5, "ID 模拟运费已折算到美元量级");

    // 严格过滤：用户要求毛利率 95% 时不得放宽标准、不得暗中把 49% 的候选塞回来。
    const strict = await runSelection({ shopId: "s-a", filters: { ...baseFilters, targetRegion: "US", minMarginRate: 0.95 } });
    assert.equal(strict.candidates.length, 0, "95% 毛利率下无合格候选，如实返回空列表");
    assert.ok(strict.note !== undefined, "数量偏少时返回提示");

    // 财务报表抽查：第一条候选按同公式手工重算，字段必须一致。
    const first = us.candidates[0];
    const { fee } = calcShippingFee("US", first.weightGrams);
    const manual = computeSelectionFinance({
      region: "US",
      sellingPrice: first.sellingPrice,
      costRmb: first.costRmb,
      weightGrams: first.weightGrams,
      shippingFee: fee,
      fxRate: USD_TO_RMB,
      platformRate: PLATFORM_FEE_RATE,
      commissionRate: CREATOR_COMMISSION_RATE,
      refundRate: REFUND_RESERVE_RATE,
    });
    assert.equal(first.netProfit, manual.netProfit);
    assert.equal(first.maxCpa, manual.maxCpa);
    assert.equal(first.breakevenRoas, manual.breakevenRoas);

    // 店铺不存在时拒绝生成。
    await assert.rejects(runSelection({ shopId: "s-none", filters: { ...baseFilters, targetRegion: "US", minMarginRate: 0.45 } }));

    // 视频透视：结构齐全且与候选品 id 匹配（稳定派生）；关键帧节点对齐 0.5s/4s/9s/16s。
    const insight = getVideoInsight(first.candidateId, mockVideoUrlOf(first.candidateId));
    assert.equal(insight.durationSeconds, 20);
    assert.equal(insight.sections.length, 4);
    assert.equal(insight.sections[0].phase, "hook");
    assert.equal(insight.sections[0].timeRange, "00:00 - 00:03");
    assert.ok(insight.sections[0].keyframeDescription.includes("0.5s"), "Hook 关键帧节点为 0.5s");
    assert.ok(insight.sections[3].keyframeDescription.includes("16s"), "挂车关键帧节点为 16s");
    assert.equal(insight.sections[3].phase, "cta");
    assert.ok(insight.transcript.includes(insight.sections[0].englishLine));
    assert.ok(insight.objectiveFacts.length >= 8, "8 维客观事实");
    assert.throws(() => getVideoInsight(first.candidateId, "not-a-url"), /http\(s\)/, "非法视频地址拒绝");

    // 手动添加候选：字段合规且可后续推进。
    const manualCandidate = buildManualCandidate({ name: "测试商品", category: "3C数码", sellingPrice: 19.99, costRmb: 8, weightGrams: 150 }, "US");
    assert.equal(manualCandidate.costEdited, true);
    assert.equal(Number.isFinite(manualCandidate.netProfit), true);
    assert.ok(manualCandidate.builtInScripts.length === 3);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
