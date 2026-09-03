// 用途：视频脚本生成 Flow 双模式测试（临时 SQLite 库 + 假模型输出）：
// persist:false 只返回草稿（不写 VideoScript）；persist:true（缺省）正常落库回归；直传商品上下文不查库。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";
import type { GenerateTextFn } from "@/types";

// 假模型输出：时长 5 秒、首镜头 3 秒且口播含钩子（满足 flow 全部校验）。
const FAKE_SCRIPT = JSON.stringify({
  hook: "Test hook for the shot.",
  cta: "Tap below.",
  shots: [
    { scene: "手持产品特写", voiceover: "Test hook for the shot.", subtitle: "Test hook for the shot.", seconds: 3 },
    { scene: "指向小黄车", voiceover: "Tap below.", subtitle: "Tap below.", seconds: 2 },
  ],
});

function fakeGenerateText(): GenerateTextFn {
  return Object.assign(async (_systemPrompt: string, _userPrompt: string, _signal?: AbortSignal) => FAKE_SCRIPT, { modelId: "fake-model" });
}

test("脚本生成：persist:false 只返草稿不写库；persist:true 落库；直传产品上下文不依赖查库", async () => {
  const { prisma, url, dbPath } = createTempDb("script-flow-test");
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    const { runVideoScriptGeneration } = await import("@/agent/video-script-flow");

    // persist:false（默认缺省 true，这里显式 false）：不产生正式脚本，返回结构化草稿。
    const draftResult = await runVideoScriptGeneration({
      shopId: "s-a",
      product: { name: "自动卷线充电器", category: "3C数码", description: "一拉即收" },
      type: "种草",
      duration: 5,
      language: "en",
      generateText: fakeGenerateText(),
      persist: false,
    });
    assert.equal(await prisma.videoScript.count({ where: { shopId: "s-a" } }), 0, "草稿模式不写库");
    assert.ok(draftResult.draft, "返回内存草稿");
    assert.equal(draftResult.draft?.durationSeconds, 5);
    assert.equal(draftResult.draft?.sections.length, 2, "分镜结构与 VideoScript shots 对应");
    assert.equal(draftResult.draft?.angleType, "pain", "种草 → pain 叙事流派");

    // persist:true：正式落库（现有创作工坊回归行为）。
    const savedResult = await runVideoScriptGeneration({
      shopId: "s-a",
      productName: undefined,
      product: { name: "手动商品", category: "家居厨房", description: null },
      type: "教程",
      duration: 5,
      language: "en",
      generateText: fakeGenerateText(),
    });
    const rows = await prisma.videoScript.findMany({ where: { shopId: "s-a" } });
    assert.equal(rows.length, 1, "persist:true 落库");
    assert.ok(savedResult.scriptId.length > 0);
    assert.equal(rows[0].type, "教程");
    assert.equal(rows[0].duration, 5);

    // 直传 product（选品候选）：不触发 resolveProductByName（候选不存在于数据库也不报错）。
    const noDbResult = await runVideoScriptGeneration({
      shopId: "s-a",
      product: { name: "不存在的候选商品", category: "美妆个护", description: "卖点" },
      type: "种草",
      duration: 5,
      language: "en",
      generateText: fakeGenerateText(),
      persist: false,
    });
    assert.ok(noDbResult.draft, "候选商品直传不查库");
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
