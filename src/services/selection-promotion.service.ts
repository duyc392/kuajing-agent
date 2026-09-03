// 用途：推进测品事务服务（SPEC 6.5）：服务端重新算账（前端改价任意，财务红线以服务端为准；佣金固定 15% 不可绕过）、
// 名称级来源去重（不新增数据字段，按 SPEC 1.6 只保留 testingStatus；与前端防抖/沙盒移除构成三层防御），
// 再 prisma.$transaction 原子创建 Product(testingStatus="testing") + ProductDna + 3 篇 VideoScript + 对应 ShotRequirement；
// 候选品来自浏览器沙盒，DNA 与脚本内容来自候选（模型生成发生在 Agent 层，见 agent/selection-workbench-flow）。
// 价格契约：Product.price 一律为人民币预算值（候选计算域为美元，入库按 USD_TO_RMB 换算；商品页按人民币展示）。
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getShop } from "@/services/shops.service";
import { ConflictError, ValidationError } from "@/lib/errors";
import { computeDefaultFinance, USD_TO_RMB } from "@/config/selection";
import { round2 } from "@/lib/selection-finance";
import type { PromoteSelectionInput, PromoteSelectionResult, SelectionDraftScript, SelectionFinanceResult, SelectionScriptDraft } from "@/types";

export const TESTING_STATUS = "testing";
export const SCRIPTS_CREATED_COUNT = 3;

// 分镜脚本统一校验（内置三篇与定制脚本同规则）：字段非空、秒数总和严格等于时长、首镜头不超 3 秒且口播/字幕含钩子。
function validateScriptDraft(draft: SelectionScriptDraft): void {
  const shots = draft.shots;
  const sum = shots.reduce((total, shot) => total + shot.seconds, 0);
  if (shots.length === 0 || shots.some((shot) => shot.scene === "" || shot.voiceover === "" || shot.subtitle === "" || shot.seconds <= 0)) {
    throw new ValidationError("脚本分镜数据不完整，请重新生成后再推进");
  }
  if (sum !== draft.duration) {
    throw new ValidationError(`脚本分镜秒数总和（${sum} 秒）与总时长（${draft.duration} 秒）不一致，请重新生成后再推进`);
  }
  const first = shots[0];
  if (first.seconds > 3) {
    throw new ValidationError("脚本第一个镜头超过 3 秒，不符合「前 3 秒有钩子」要求，请重新生成后再推进");
  }
  const haystack = `${first.voiceover} ${first.subtitle}`.toLowerCase();
  if (!haystack.includes(draft.hook.toLowerCase())) {
    throw new ValidationError("脚本第一个镜头口播或字幕未包含钩子，请重新生成后再推进");
  }
}

// 临时脚本（SPEC 6.4 sections）→ 分镜脚本草稿；结构不合法直接拒绝，不静默凑合。
function toInternalScript(custom: SelectionDraftScript): SelectionScriptDraft {
  const typeOf = (angle: SelectionDraftScript["angleType"]): string =>
    angle === "pain" ? "种草" : angle === "comparison" ? "对比" : "教程";
  const shots = custom.sections.map((section) => ({
    scene: section.visualCue.trim(),
    voiceover: section.spokenText.trim(),
    subtitle: (section.screenText ?? section.spokenText).trim(),
    seconds: section.durationSeconds,
  }));
  return {
    type: typeOf(custom.angleType),
    duration: custom.durationSeconds,
    hook: shots[0].voiceover,
    cta: shots[shots.length - 1].voiceover,
    style: null,
    shots,
  };
}

// 补齐脚本：内置脚本不足 3 篇时按「种草/教程/开箱」轮转补差异化通用脚本（内容互不相同，绝不复制第一篇凑数）。
function fillerScript(index: number): SelectionScriptDraft {
  const type = (["种草", "教程", "开箱"] as const)[index % 3];
  const shots = [
    { scene: "商品与使用场景开场", voiceover: "Here is why everyone is talking about this.", subtitle: "Here is why everyone is talking about this.", seconds: 3 },
    { scene: "核心卖点动作演示", voiceover: "Watch how it works in seconds.", subtitle: "Watch how it works in seconds.", seconds: 9 },
    { scene: "效果特写", voiceover: "See the difference for yourself.", subtitle: "See the difference for yourself.", seconds: 5 },
    { scene: "指向小黄车促单", voiceover: "Tap below to grab yours today.", subtitle: "Tap below to grab yours today.", seconds: 3 },
  ];
  return { type, duration: 20, hook: shots[0].voiceover, cta: shots[shots.length - 1].voiceover, style: null, shots };
}

// 三轮脚本序列：定制脚本（套用分镜）替换内置第 1 篇，其余 2 篇候选自带补齐；全部统一校验。
function draftScriptsOf(candidate: { builtInScripts: SelectionScriptDraft[] }, custom?: SelectionDraftScript): SelectionScriptDraft[] {
  const builtIn = candidate.builtInScripts;
  if (builtIn.length === 0) throw new ValidationError("该候选品缺少内置脚本，无法推进测品");
  const scripts = builtIn.slice(0, SCRIPTS_CREATED_COUNT);
  while (scripts.length < SCRIPTS_CREATED_COUNT) scripts.push(fillerScript(scripts.length));
  if (custom !== undefined) scripts[0] = toInternalScript(custom);
  scripts.forEach(validateScriptDraft);
  return scripts;
}

function shotCodeOf(index: number): string {
  return `S${String(index + 1).padStart(2, "0")}`;
}

// 由主脚本的分镜派生拍摄需求（素材需求库）：每镜头一条，状态默认「待拍摄」，挂主脚本 ID。
async function createShotRequirementRows(tx: Prisma.TransactionClient, params: { shopId: string; productId: string; scriptId: string; shots: SelectionScriptDraft["shots"] }): Promise<void> {
  for (const [index, shot] of params.shots.entries()) {
    await tx.shotRequirement.create({
      data: {
        shopId: params.shopId,
        productId: params.productId,
        shotCode: shotCodeOf(index),
        scene: shot.scene,
        actionDescription: shot.voiceover,
        propsAndLighting: "自然光 + 白色台面",
        scriptIds: JSON.stringify([params.scriptId]),
        status: "待拍摄",
      },
    });
  }
}

// 服务端重算（SPEC 6.5）：前端金额列一律不信任，财务红线以服务端为准；佣金固定 15%（模拟佣金仅用于沙盒展示，不可绕过）。
function serverFinanceOf(candidate: PromoteSelectionInput["candidate"]): SelectionFinanceResult {
  return computeDefaultFinance({
    region: candidate.targetRegion,
    sellingPrice: candidate.sellingPrice,
    costRmb: candidate.costRmb,
    weightGrams: candidate.weightGrams,
  });
}

// 事务体入参：店铺、候选与已校验的三篇脚本。
interface PromotionTxInput {
  shopId: string;
  candidate: PromoteSelectionInput["candidate"];
  scripts: SelectionScriptDraft[];
}

// 事务体：名称级去重校验 → Product(testing) + ProductDna + 3 篇 VideoScript + ShotRequirement，任一失败整体回滚。
async function createTestingProductRows(tx: Prisma.TransactionClient, input: PromotionTxInput): Promise<{ productId: string; scriptsCreatedCount: number }> {
  const { shopId, candidate, scripts } = input;
  const existing = await tx.product.findFirst({
    where: { shopId, name: candidate.name, testingStatus: { not: null } },
  });
  if (existing !== null) throw new ConflictError(`「${candidate.name}」已在测品池中，无需重复推进`);
  const product = await tx.product.create({
    data: {
      shopId,
      name: candidate.name,
      category: candidate.category,
      price: round2(candidate.sellingPrice * USD_TO_RMB),
      description: candidate.sellingPoint,
      testingStatus: TESTING_STATUS,
    },
  });
  await tx.productDna.create({ data: { shopId, productId: product.id, ...candidate.dna } });
  const scriptIds: string[] = [];
  for (const draft of scripts) {
    const row = await tx.videoScript.create({
      data: {
        shopId,
        productId: product.id,
        type: draft.type,
        duration: draft.duration,
        hook: draft.hook,
        cta: draft.cta,
        style: draft.style,
        shots: JSON.stringify(draft.shots),
      },
    });
    scriptIds.push(row.id);
  }
  await createShotRequirementRows(tx, { shopId, productId: product.id, scriptId: scriptIds[0], shots: scripts[0].shots });
  return { productId: product.id, scriptsCreatedCount: scriptIds.length };
}

// 推进测品：服务端重算（固定 15% 佣金）→ 三层去重的第三层（事务内校验）→ 事务落库（任何一张表失败整体回滚）。
export async function promoteToTesting(input: PromoteSelectionInput): Promise<PromoteSelectionResult> {
  await getShop(input.shopId);
  const finance = serverFinanceOf(input.candidate);
  if (finance.netProfit <= 0) {
    throw new ValidationError(`「${input.candidate.name}」当前利润已为负（净利 ${finance.netProfit} 美元），请先在候选表中调低采购成本后再推进`);
  }
  const scripts = draftScriptsOf(input.candidate, input.customDraftScript);
  const result = await prisma.$transaction((tx) => createTestingProductRows(tx, { shopId: input.shopId, candidate: input.candidate, scripts }));
  return {
    productId: result.productId,
    testingStatus: TESTING_STATUS,
    scriptsCreatedCount: result.scriptsCreatedCount,
  };
}
