// 用途：选品工作台 Agent 层编排（SPEC 7.1 / 6.4 / 6.5）：临时候选脚本生成（候选信息不查库直传进提示词）与
// 「推进前至少一条真实 Agent 脚本」的推进编排：无定制脚本时先调用视频脚本 Flow 生成 1 条草稿（persist:false），
// 成功后才进入服务层事务；模型失败则不创建任何正式数据。本层是 API 路由与 services 之间的唯一编排点。
import { createAgent } from "@/agent/core";
import { generateTextOnce } from "@/agent/generate";
import { runVideoScriptGeneration } from "@/agent/video-script-flow";
import { promoteToTesting } from "@/services/selection-promotion.service";
import type { GenerateTextFn, GenerateDraftScriptResult, PromoteSelectionResult, SelectionCandidate, SelectionDraftScript, VideoInsightResult } from "@/types";

// 目标市场 → 脚本语言（与系统提示词的生成工具语言规则一致：US/UK 用 en，ID 用 id）。
function languageOf(region: SelectionCandidate["targetRegion"]): string {
  return region === "ID" ? "id" : "en";
}

// 构建一次性的模型生成函数：复用 Agent 的 Key 注入与模型配置（与对话/工坊同一来源 data/config.json）。
async function createSelectionGenerateText(): Promise<GenerateTextFn> {
  const agent = await createAgent({ systemPrompt: "", messages: [] });
  return Object.assign(
    (systemPrompt: string, userPrompt: string, signal?: AbortSignal) => generateTextOnce({ agent, systemPrompt, userPrompt, signal }),
    { modelId: agent.state.model.id },
  );
}

// 选品候选 → 脚本商品上下文（不查库：候选本身带有名称/类目/卖点）。
function productContextOf(candidate: SelectionCandidate) {
  return {
    name: candidate.name,
    category: candidate.category,
    description: candidate.sellingPoint,
  };
}

// 生成临时脚本（SPEC 6.4）：时长严格等于参考视频，persist:false 不落库；产品信息与定格分析注入提示词。
export async function generateDraftScript(params: {
  shopId: string;
  candidate: SelectionCandidate;
  insight?: VideoInsightResult;
  signal?: AbortSignal;
}): Promise<GenerateDraftScriptResult> {
  const generateText = await createSelectionGenerateText();
  const type = params.candidate.builtInScripts[0]?.type ?? "种草";
  const duration = params.insight?.durationSeconds ?? 20;
  const result = await runVideoScriptGeneration({
    shopId: params.shopId,
    product: productContextOf(params.candidate),
    type,
    duration,
    language: languageOf(params.candidate.targetRegion),
    style: params.insight ? "参考视频透视节奏" : undefined,
    generateText,
    persist: false,
    insight: params.insight,
    signal: params.signal,
  });
  if (!result.draft) throw new Error("脚本生成失败，请重试");
  return { script: result.draft, persisted: false };
}

// 推进测品编排（SPEC 6.5）：无定制脚本时先生成 1 条真实 Agent 草稿再进事务（模型失败不创建 Product）。
export async function promoteSelection(params: {
  shopId: string;
  candidate: SelectionCandidate;
  customDraftScript?: SelectionDraftScript;
  signal?: AbortSignal;
}): Promise<PromoteSelectionResult> {
  let customDraftScript = params.customDraftScript;
  if (customDraftScript === undefined) {
    const generated = await generateDraftScript({ shopId: params.shopId, candidate: params.candidate, signal: params.signal });
    customDraftScript = generated.script;
  }
  return promoteToTesting({ shopId: params.shopId, candidate: params.candidate, customDraftScript });
}
