// 用途：技能加载链路测试（临时 SQLite 库 + 临时 skills 目录）：常驻/按需分段注入、按需段不泄正文、按名查询命中与未命中、
// 禁用后不再返回、常驻开关更新后分段对调；生成流水线注入——常驻技能进文案/脚本提示词（转义）、按需技能不进、无技能时区块不出现。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConflictError } from "@/lib/errors";
import { createTempDb, removeTempDb } from "../../../prisma/test-utils";

// Windows 下进程 CWD 句柄释放有延迟：重试删除临时 skills 目录；全部失败只警告（OS 临时目录会兜底清理，不影响测试结论）。
async function removeSkillsDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  console.warn(`[skills-test] 临时 skills 目录删除失败（Windows 句柄延迟），由系统临时目录兜底清理：${dir}`);
}

test("技能加载：常驻/按需分段、按名查询与开关更新", async () => {
  const { prisma, url, dbPath } = createTempDb("skills-test");
  // 技能正文目录按 process.cwd()/skills 解析：先切到临时目录再导入服务，避免测试写脏仓库的 skills/。
  const cwdBackup = process.cwd();
  const skillsDir = mkdtempSync(path.join(tmpdir(), "kuajing-skills-"));
  process.chdir(skillsDir);
  process.env.DATABASE_URL = url;
  try {
    const { createSkill, updateSkill } = await import("@/services/skills.service");
    const { getEnabledSkillsByNames } = await import("@/services/skill-lookup.service");
    const { loadSkillsBlock } = await import("@/agent/skills");
    const { runCopyGeneration } = await import("@/agent/copywriting-flow");
    const { buildVideoScriptUserPrompt } = await import("@/agent/prompts/video-script");
    const { buildLiveScriptUserPrompt } = await import("@/agent/prompts/live-script");

    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    await prisma.product.create({ data: { id: "p-a", shopId: "s-a", name: "美妆镜" } });

    const resident = await createSkill({
      name: "强调包邮",
      description: "生成商品文案时",
      prompt: "标题与卖点里突出 <free shipping>",
      alwaysApply: true,
    });
    assert.equal(resident.alwaysApply, true);

    const onDemand = await createSkill({
      name: "美区SOP",
      description: "上架美区商品时",
      prompt: "第一步查竞品定价，第二步定售价",
      alwaysApply: false,
    });
    assert.equal(onDemand.alwaysApply, false);

    // 幂等含加载模式：同内容同模式返回原记录；同内容不同模式返回冲突，不静默忽略卖家的模式选择。
    const again = await createSkill({ name: "强调包邮", description: "生成商品文案时", prompt: "标题与卖点里突出 <free shipping>", alwaysApply: true });
    assert.equal(again.id, resident.id);
    await assert.rejects(
      createSkill({ name: "强调包邮", description: "生成商品文案时", prompt: "标题与卖点里突出 <free shipping>", alwaysApply: false }),
      ConflictError,
    );

    // 分段注入：常驻段含全文，按需段只列名称与说明、不出现正文。
    const block = await loadSkillsBlock();
    assert.equal(block.resident.length, 1);
    assert.equal(block.onDemand.length, 1);
    assert.ok(block.resident[0].includes("【强调包邮】"));
    assert.ok(block.resident[0].includes("free shipping"));
    assert.ok(block.onDemand[0].includes("【美区SOP】"));
    assert.ok(block.onDemand[0].includes("上架美区商品时"));
    assert.ok(!block.onDemand[0].includes("第一步查竞品定价"));

    // 生成流水线注入：常驻技能进入文案生成提示词（转义），按需技能不进入；假模型捕获实际输入，输出满足美区规则一次通过。
    const prompts: string[] = [];
    const captureGenerate = Object.assign(
      async (_systemPrompt: string, userPrompt: string, _signal?: AbortSignal) => {
        prompts.push(userPrompt);
        return JSON.stringify({ title: "Mirror", description: "free shipping with reviews", sellingPoints: "free shipping\nreviews" });
      },
      { modelId: "fake-model" },
    );
    await runCopyGeneration({ productName: "美妆镜", language: "en", shopId: "s-a", generateText: captureGenerate });
    assert.equal(prompts.length, 1, "市场规则一次通过，不重试");
    assert.ok(prompts[0].includes("卖家确认的技能规范"), "常驻技能区块注入生成提示词");
    assert.ok(prompts[0].includes("【强调包邮】"), "技能名注入");
    assert.ok(prompts[0].includes("〈free shipping〉"), "技能正文转义后注入");
    assert.ok(!prompts[0].includes("美区SOP"), "按需技能不进生成提示词");

    // 视频/直播脚本构建器：传入注入、缺省时区块完全不出现。
    const rules = ["- 【强调包邮】标题突出包邮"];
    assert.ok(buildVideoScriptUserPrompt({ type: "种草", duration: 5, product: null, skillRules: rules }).includes("卖家确认的技能规范"));
    assert.ok(!buildVideoScriptUserPrompt({ type: "种草", duration: 5, product: null }).includes("卖家确认的技能规范"));
    assert.ok(buildLiveScriptUserPrompt({ durationMinutes: 30, products: [], skillRules: rules }).includes("卖家确认的技能规范"));

    // 按名查询：命中返回全文，未命中如实回报；名称去空白后精确匹配。
    const hit = await getEnabledSkillsByNames([" 强调包邮 ", "不存在"]);
    assert.deepEqual(hit.found.map((skill) => skill.name), ["强调包邮"]);
    assert.deepEqual(hit.missing, ["不存在"]);

    // 禁用后不再可加载。
    await updateSkill(resident.id, { enabled: false });
    const afterDisable = await getEnabledSkillsByNames(["强调包邮"]);
    assert.deepEqual(afterDisable.found, []);
    assert.deepEqual(afterDisable.missing, ["强调包邮"]);

    // 常驻开关更新后分段对调。
    const toggled = await updateSkill(onDemand.id, { alwaysApply: true });
    assert.equal(toggled.alwaysApply, true);
    const blockAfter = await loadSkillsBlock();
    assert.equal(blockAfter.resident.length, 1);
    assert.equal(blockAfter.onDemand.length, 0);
  } finally {
    await prisma.$disconnect();
    // 动态 import 的服务层经 @/lib/db 持有单例连接，必须一并断开，否则临时库文件句柄不释放。
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    process.chdir(cwdBackup);
    await removeSkillsDir(skillsDir);
    await removeTempDb(dbPath);
  }
});
