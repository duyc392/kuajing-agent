// 用途：直播脚本生成编排（Agent 层，方向 agent → services/lib）：解析商品列表（未指定时用店铺全部商品）、构建提示词、调用模型生成（每次调用记录审计）、
// 解析与严格校验（阶段完整、分钟数总和严格等于总时长、首阶段为开场、四环节齐全，有限重试）、存库并返回结构化结果。
import { AppError } from "@/lib/errors";
import { liveFlowStructureProblems } from "@/lib/live-flow";
import { callWithGenerationAudit } from "@/agent/generate";
import { resolveProductByName } from "@/services/product-lookup.service";
import { listProducts } from "@/services/products.service";
import { listMemories } from "@/services/memory.service";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { createLiveScript } from "@/services/live-scripts.service";
import { buildLiveScriptSystemPrompt, buildLiveScriptUserPrompt, type LiveProductContext } from "@/agent/prompts/live-script";
import type { GenerateTextFn, LiveSegment, LiveScriptToolDetails } from "@/types";

export interface RunLiveScriptParams {
  productNames?: string[];
  durationMinutes: number;
  language: string;
  style?: string;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
}

interface ParsedFlow {
  segments: LiveSegment[];
}

const MAX_RETRIES = 3;

// 从模型输出中解析 JSON（容忍代码块围栏与前后杂文），flow 缺失或字段不完整抛中文错误。
function parseFlowJson(text: string): ParsedFlow {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AppError("直播脚本模型输出格式错误，请重试", "LIVE_PARSE_ERROR", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError("直播脚本模型输出格式错误，请重试", "LIVE_PARSE_ERROR", 502);
  }
  const obj = parsed as Record<string, unknown>;
  const rawFlow = Array.isArray(obj.flow) ? obj.flow : [];
  if (rawFlow.length === 0) throw new AppError("直播脚本模型输出不完整，请重试", "LIVE_PARSE_ERROR", 502);
  const segments: LiveSegment[] = rawFlow.map((raw) => {
    const segment = raw as Record<string, unknown>;
    return {
      phase: typeof segment.phase === "string" ? segment.phase.trim() : "",
      minutes: typeof segment.minutes === "number" && Number.isInteger(segment.minutes) ? segment.minutes : 0,
      goal: typeof segment.goal === "string" ? segment.goal.trim() : "",
      script: typeof segment.script === "string" ? segment.script.trim() : "",
    };
  });
  if (segments.some((segment) => segment.phase === "" || segment.goal === "" || segment.script === "" || segment.minutes <= 0)) {
    throw new AppError("直播脚本阶段字段不完整，请重试", "LIVE_PARSE_ERROR", 502);
  }
  return { segments };
}

// 业务规则校验（PRD 故事 28 验收标准），返回违规原因列表；空数组表示通过。结构与服务层/前端共用同一规则。
function flowProblems(durationMinutes: number, segments: LiveSegment[]): string[] {
  const problems = liveFlowStructureProblems(segments);
  const sum = segments.reduce((total, segment) => total + segment.minutes, 0);
  if (sum !== durationMinutes) {
    problems.unshift(`所有阶段分钟数总和为 ${sum}，必须恰好等于总时长 ${durationMinutes} 分钟`);
  }
  return problems;
}

// 解析本场直播的商品上下文：卖家点名了商品则逐一按原名解析（找不到 404）；未点名时使用店铺全部商品。
async function resolveProducts(params: RunLiveScriptParams): Promise<{ contexts: LiveProductContext[]; names: string[] }> {
  if (params.productNames && params.productNames.length > 0) {
    const contexts: LiveProductContext[] = [];
    for (const name of params.productNames) {
      const product = await resolveProductByName({ productName: name, shopId: params.shopId });
      contexts.push({ name: product.name, category: product.category, description: product.description });
    }
    return { contexts, names: contexts.map((context) => context.name) };
  }
  const summaries = await listProducts(params.shopId);
  return {
    contexts: summaries.map((summary) => ({ name: summary.name, category: summary.category, description: null })),
    names: summaries.map((summary) => summary.name),
  };
}

export async function runLiveScriptGeneration(params: RunLiveScriptParams): Promise<LiveScriptToolDetails> {
  const { contexts, names } = await resolveProducts(params);
  let extraInstruction = "";
  let parsed: ParsedFlow | null = null;
  // 店铺长期记忆注入直播流程生成（PRD 故事 40：定位与偏好自动应用），循环外加载一次、受条数上限约束。
  const memories = (await listMemories(params.shopId)).slice(-MAX_CONTEXT_MEMORIES);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userPrompt = buildLiveScriptUserPrompt({ durationMinutes: params.durationMinutes, style: params.style, products: contexts, memories })
      + (extraInstruction === "" ? "" : `\n${extraInstruction}`);
    const text = await callWithGenerationAudit({
      shopId: params.shopId,
      type: "live-script",
      modelId: params.generateText.modelId ?? "unknown",
      prompt: userPrompt,
      call: () => params.generateText(buildLiveScriptSystemPrompt(params.language), userPrompt, params.signal),
    });
    parsed = parseFlowJson(text);
    const problems = flowProblems(params.durationMinutes, parsed.segments);
    if (problems.length === 0) break;
    extraInstruction = `注意：上一版不符合要求（${problems.join("；")}），请重新安排各阶段的分钟数与内容后输出。`;
    if (attempt === MAX_RETRIES - 1) {
      throw new AppError(`直播脚本不符合要求：${problems.join("；")}，请重试`, "LIVE_FLOW_ERROR", 502);
    }
  }
  if (!parsed) throw new AppError("直播脚本生成失败，请重试", "LIVE_GENERATE_ERROR", 502);
  const script = await createLiveScript({
    shopId: params.shopId,
    duration: params.durationMinutes * 60,
    productNames: names,
    segments: parsed.segments,
  });
  return {
    liveScriptId: script.id,
    durationMinutes: params.durationMinutes,
    segmentCount: script.segments.length,
    productCount: script.productNames.length,
    language: params.language,
  };
}
