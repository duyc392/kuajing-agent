// 用途：视频脚本生成编排（Agent 层，方向 agent → services/lib）：可选解析商品、构建提示词、调用模型生成、
// 解析与校验（钩子/CTA/分镜字段、分镜秒数总和严格等于总时长、首镜头不超过 3 秒且承载钩子，有限重试）、
// 记录生成审计、按 persist 决定落库或返回内存草稿；支持注入参考爆款视频透视（选品工作台套用分镜）。
import { AppError } from "@/lib/errors";
import { callWithGenerationAudit } from "@/agent/generate";
import { escapePromptData } from "@/agent/prompts/escape";
import { resolveProductByName } from "@/services/product-lookup.service";
import { listMemories } from "@/services/memory.service";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { createScript } from "@/services/video-scripts.service";
import { buildVideoScriptSystemPrompt, buildVideoScriptUserPrompt, type ScriptProductContext } from "@/agent/prompts/video-script";
import type { MemoryContextItem } from "@/agent/prompts/memory";
import type { GenerateTextFn, ScriptShot, ScriptToolDetails, SelectionDraftScript, VideoInsightResult } from "@/types";

export interface RunVideoScriptParams {
  // 商品上下文二选一：productName 需要查库解析（正式商品）；product 直传（选品候选，不查库）。
  productName?: string;
  product?: ScriptProductContext | null;
  type: string;
  duration: number;
  language: string;
  style?: string;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
  // true（缺省）写入脚本库；false 只返回内存草稿（选品工作台临时脚本，不产生正式数据）。
  persist?: boolean;
  // 参考爆款视频透视（选品工作台「套用此分镜写脚本」时传入，注入模仿节奏与台词）。
  insight?: VideoInsightResult;
}

interface ParsedScript {
  hook: string;
  cta: string;
  shots: ScriptShot[];
}

const MAX_RETRIES = 3;
const HOOK_MAX_SECONDS = 3;

// 从模型输出中解析 JSON（容忍代码块围栏与前后杂文），钩子/CTA/分镜缺失抛中文错误。
function parseScriptJson(text: string): ParsedScript {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AppError("脚本模型输出格式错误，请重试", "SCRIPT_PARSE_ERROR", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError("脚本模型输出格式错误，请重试", "SCRIPT_PARSE_ERROR", 502);
  }
  const obj = parsed as Record<string, unknown>;
  const hook = typeof obj.hook === "string" ? obj.hook.trim() : "";
  const cta = typeof obj.cta === "string" ? obj.cta.trim() : "";
  const rawShots = Array.isArray(obj.shots) ? obj.shots : [];
  const shots: ScriptShot[] = rawShots.map((raw) => {
    const shot = raw as Record<string, unknown>;
    return {
      scene: typeof shot.scene === "string" ? shot.scene.trim() : "",
      voiceover: typeof shot.voiceover === "string" ? shot.voiceover.trim() : "",
      subtitle: typeof shot.subtitle === "string" ? shot.subtitle.trim() : "",
      seconds: typeof shot.seconds === "number" && Number.isInteger(shot.seconds) ? shot.seconds : 0,
    };
  });
  if (hook === "" || cta === "" || shots.length === 0) throw new AppError("脚本模型输出不完整，请重试", "SCRIPT_PARSE_ERROR", 502);
  if (shots.some((shot) => shot.scene === "" || shot.voiceover === "" || shot.subtitle === "" || shot.seconds <= 0)) {
    throw new AppError("脚本分镜字段不完整，请重试", "SCRIPT_PARSE_ERROR", 502);
  }
  return { hook, cta, shots };
}

// 校验失败原因（用于重试提示与最终报错）：分镜秒数总和必须严格等于总时长（PRD 故事 25）。
function durationMismatch(params: RunVideoScriptParams, parsed: ParsedScript): number | null {
  const sum = parsed.shots.reduce((total, shot) => total + shot.seconds, 0);
  return sum === params.duration ? null : sum;
}

// 校验失败原因：首镜头必须不超过 3 秒且口播或字幕承载钩子文案（PRD 故事 26：前 3 秒有钩子）。
function hookShotProblem(parsed: ParsedScript): string | null {
  const first = parsed.shots[0];
  if (first.seconds > HOOK_MAX_SECONDS) return `第一个镜头 ${first.seconds} 秒，超过 3 秒`;
  const haystack = `${first.voiceover} ${first.subtitle}`.toLowerCase();
  return haystack.includes(parsed.hook.toLowerCase()) ? null : "第一个镜头的口播或字幕没有包含钩子文案";
}

// 类型中文名 → 叙事流派（draft-scripts 契约的 angleType；开箱归 demo）。
function angleOf(type: string): SelectionDraftScript["angleType"] {
  if (type === "对比") return "comparison";
  if (type === "种草") return "pain";
  return "demo";
}

// 内存草稿：SPEC 6.4 契约形状（orderIndex/sceneName/visualCue/spokenText/screenText），persisted 由 API 层声明 false。
function toDraftScript(parsed: ParsedScript, type: string, duration: number): SelectionDraftScript {
  return {
    title: `${type}型 · ${parsed.hook.slice(0, 40)}（${duration} 秒）`,
    angleType: angleOf(type),
    durationSeconds: duration,
    sections: parsed.shots.map((shot, index) => ({
      orderIndex: index + 1,
      sceneName: `镜头 ${index + 1}`,
      durationSeconds: shot.seconds,
      visualCue: shot.scene,
      spokenText: shot.voiceover,
      screenText: shot.subtitle,
    })),
  };
}

// 解析商品上下文：直传 product（选品候选）优先；否则按 productName 查库（正式商品，找不到 404）。
async function resolveProductContext(params: RunVideoScriptParams): Promise<{ product: ScriptProductContext | null; productId: string | null }> {
  if (params.product !== undefined) return { product: params.product, productId: null };
  if (params.productName === undefined) return { product: null, productId: null };
  const resolved = await resolveProductByName({ productName: params.productName, shopId: params.shopId });
  return {
    productId: resolved.id,
    product: { name: resolved.name, category: resolved.category, description: resolved.description },
  };
}

// 模型生成 + 结构化校验，有限重试；超限直接抛出业务错误（校验与重试规则见文件头）。
async function generateWithValidation(params: RunVideoScriptParams, product: ScriptProductContext | null, memories: MemoryContextItem[] | undefined, insightBlock: string): Promise<ParsedScript> {
  let extraInstruction = "";
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userPrompt = buildVideoScriptUserPrompt({
      type: params.type,
      duration: params.duration,
      style: params.style,
      product,
      memories,
    }) + insightBlock + (extraInstruction === "" ? "" : `\n${extraInstruction}`);
    const text = await callWithGenerationAudit({
      shopId: params.shopId,
      type: "script",
      modelId: params.generateText.modelId ?? "unknown",
      prompt: userPrompt,
      call: () => params.generateText(buildVideoScriptSystemPrompt(params.language), userPrompt, params.signal),
    });
    const parsed = parseScriptJson(text);
    const sum = durationMismatch(params, parsed);
    const hookProblem = sum === null ? hookShotProblem(parsed) : null;
    if (sum === null && hookProblem === null) return parsed;
    const problems = [
      sum === null ? null : `上一版所有镜头秒数总和为 ${sum} 秒，不等于总时长 ${params.duration} 秒`,
      hookProblem,
    ].filter((item): item is string => item !== null);
    extraInstruction = `注意：${problems.join("；")}。请重新分配镜头秒数与内容，保证所有镜头秒数总和恰好等于 ${params.duration} 秒，且第一个镜头不超过 3 秒、其口播或字幕完整包含钩子。`;
    if (attempt === MAX_RETRIES - 1) {
      throw new AppError(`脚本分镜时长或钩子不符合要求（${problems.join("；")}），请重试`, "SCRIPT_DURATION_ERROR", 502);
    }
  }
  throw new AppError("脚本生成失败，请重试", "SCRIPT_GENERATE_ERROR", 502);
}

export async function runVideoScriptGeneration(params: RunVideoScriptParams): Promise<ScriptToolDetails & { draft?: SelectionDraftScript }> {
  const { product, productId } = await resolveProductContext(params);
  // 店铺长期记忆注入脚本生成（PRD 故事 40：定位与偏好自动应用），受条数上限约束。
  const memories = (await listMemories(params.shopId)).slice(-MAX_CONTEXT_MEMORIES);
  // 参考爆款视频透视（外部数据先转义再进数据区）：长度必须与参考视频一致，结构保持 4 段。
  const insightBlock =
    params.insight === undefined
      ? ""
      : `\n<video_insight_data>\n${escapePromptData(
          JSON.stringify({
            durationSeconds: params.insight.durationSeconds,
            transcript: params.insight.transcript,
            sections: params.insight.sections,
          }),
        )}\n</video_insight_data>\n请参考上述爆款视频的分镜节奏、叙事结构与台词风格重新创作，时长精确为 ${params.duration} 秒，保持「钩子 → 进品 → 演示 → 促单」四段结构。`;
  const parsed = await generateWithValidation(params, product, memories, insightBlock);
  if (params.persist === false) {
    return {
      scriptId: "",
      type: params.type,
      duration: params.duration,
      hook: parsed.hook,
      cta: parsed.cta,
      shotCount: parsed.shots.length,
      language: params.language,
      draft: toDraftScript(parsed, params.type, params.duration),
    };
  }
  const script = await createScript({
    shopId: params.shopId,
    productId,
    type: params.type,
    duration: params.duration,
    hook: parsed.hook,
    cta: parsed.cta,
    style: params.style ?? null,
    shots: parsed.shots,
  });
  return {
    scriptId: script.id,
    type: script.type,
    duration: script.duration,
    hook: script.hook,
    cta: script.cta,
    shotCount: script.shots.length,
    language: params.language,
  };
}
