// 用途：视频脚本生成编排（Agent 层，方向 agent → services/lib）：可选解析商品、构建提示词、调用模型生成、
// 解析与校验（钩子/CTA/分镜字段、分镜秒数总和严格等于总时长、首镜头不超过 3 秒且承载钩子，有限重试）、
// 记录生成审计、存库并返回结构化结果。
import { AppError } from "@/lib/errors";
import { callWithGenerationAudit } from "@/agent/generate";
import { resolveProductByName } from "@/services/product-lookup.service";
import { listMemories } from "@/services/memory.service";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { createScript } from "@/services/video-scripts.service";
import { buildVideoScriptSystemPrompt, buildVideoScriptUserPrompt, type ScriptProductContext } from "@/agent/prompts/video-script";
import type { GenerateTextFn, ScriptShot, ScriptToolDetails } from "@/types";

export interface RunVideoScriptParams {
  productName?: string;
  type: string;
  duration: number;
  language: string;
  style?: string;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
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

export async function runVideoScriptGeneration(params: RunVideoScriptParams): Promise<ScriptToolDetails> {
  let product: ScriptProductContext | null = null;
  let productId: string | null = null;
  if (params.productName) {
    const resolved = await resolveProductByName({ productName: params.productName, shopId: params.shopId });
    productId = resolved.id;
    product = { name: resolved.name, category: resolved.category, description: resolved.description };
  }
  let extraInstruction = "";
  let parsed: ParsedScript | null = null;
  // 店铺长期记忆注入脚本生成（PRD 故事 40：定位与偏好自动应用），受条数上限约束。
  const memories = (await listMemories(params.shopId)).slice(-MAX_CONTEXT_MEMORIES);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userPrompt = buildVideoScriptUserPrompt({ type: params.type, duration: params.duration, style: params.style, product, memories })
      + (extraInstruction === "" ? "" : `\n${extraInstruction}`);
    const text = await callWithGenerationAudit({
      shopId: params.shopId,
      type: "script",
      modelId: params.generateText.modelId ?? "unknown",
      prompt: userPrompt,
      call: () => params.generateText(buildVideoScriptSystemPrompt(params.language), userPrompt, params.signal),
    });
    parsed = parseScriptJson(text);
    const sum = durationMismatch(params, parsed);
    const hookProblem = sum === null ? hookShotProblem(parsed) : null;
    if (sum === null && hookProblem === null) break;
    const problems = [
      sum === null ? null : `上一版所有镜头秒数总和为 ${sum} 秒，不等于总时长 ${params.duration} 秒`,
      hookProblem,
    ].filter((item): item is string => item !== null);
    extraInstruction = `注意：${problems.join("；")}。请重新分配镜头秒数与内容，保证所有镜头秒数总和恰好等于 ${params.duration} 秒，且第一个镜头不超过 3 秒、其口播或字幕完整包含钩子。`;
    if (attempt === MAX_RETRIES - 1) {
      throw new AppError(`脚本分镜时长或钩子不符合要求（${problems.join("；")}），请重试`, "SCRIPT_DURATION_ERROR", 502);
    }
  }
  if (!parsed) throw new AppError("脚本生成失败，请重试", "SCRIPT_GENERATE_ERROR", 502);
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
