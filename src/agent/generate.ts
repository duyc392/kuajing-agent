// 用途：Agent层单次模型生成与生成审计。所有请求贯通取消、输出预算和真实模型容量。
import type { Agent } from "@earendil-works/pi-agent-core";
import type { Context } from "@earendil-works/pi-ai";
import { logGeneration } from "@/services/audit.service";
import { AppError } from "@/lib/errors";
import { estimateContextTokens } from "@/lib/conversation-context";
import { readContextSettings } from "@/config/context";
import type { GenerationInput } from "@/types";

export function toFriendlyLlmError(raw: string | undefined): string {
  const text = (raw ?? "").toLowerCase();
  if (/connection|network|fetch failed|econnrefused|enotfound|timeout|etimedout|socket/.test(text)) {
    return "无法连接 AI 服务，请检查网络或代理后重试。";
  }
  if (/401|unauthorized|invalid.*key|authentication|api key/.test(text)) {
    return "AI 服务拒绝了请求：API Key 无效或已过期，请到设置页检查。";
  }
  if (/429|rate limit|quota|insufficient/.test(text)) return "请求过于频繁或额度不足，请稍后重试。";
  return "AI 服务暂时不可用，请稍后重试。";
}

export interface GenerateOnceParams {
  agent: Agent;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
  maxTokens?: number;
}

export async function callWithGenerationAudit(params: {
  shopId: string;
  type: GenerationInput["type"];
  modelId: string;
  prompt: string;
  call: () => Promise<string>;
}): Promise<string> {
  try {
    const output = await params.call();
    await logGeneration({ shopId: params.shopId, type: params.type, model: params.modelId,
      prompt: params.prompt, output, status: "success" });
    return output;
  } catch (error) {
    await logGeneration({ shopId: params.shopId, type: params.type, model: params.modelId,
      prompt: params.prompt, status: "error", error: error instanceof Error ? error.message : "未知错误" });
    throw error;
  }
}

function checkGeneration(params: GenerateOnceParams): number {
  if (params.signal?.aborted) throw new AppError("请求已取消", "REQUEST_ABORTED", 499);
  const settings = readContextSettings();
  const maxTokens = Math.min(params.maxTokens ?? settings.outputTokens, params.agent.state.model.maxTokens);
  const used = estimateContextTokens(params.systemPrompt) + estimateContextTokens(params.userPrompt) + 128;
  if (used + maxTokens + settings.safetyTokens > params.agent.state.model.contextWindow) {
    throw new AppError("模型上下文容量不足", "CONTEXT_LIMIT", 422);
  }
  return maxTokens;
}

type ModelStream = Awaited<ReturnType<Agent["streamFunction"]>>;

async function collectText(stream: ModelStream): Promise<string> {
  let text = "";
  for await (const event of stream) if (event.type === "text_delta") text += event.delta;
  const final = await stream.result();
  if (final.stopReason === "error" || final.stopReason === "aborted") {
    console.error("[agent] 模型调用失败:", final.errorMessage);
    throw new AppError(toFriendlyLlmError(final.errorMessage), "LLM_ERROR", 502);
  }
  if (!text.trim()) throw new AppError("模型没有返回任何内容，请重试", "LLM_EMPTY", 502);
  return text;
}

export async function generateTextOnce(params: GenerateOnceParams): Promise<string> {
  const maxTokens = checkGeneration(params);
  const context: Context = { systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt, timestamp: Date.now() }] };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  params.signal?.addEventListener("abort", onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const apiKey = await params.agent.getApiKey?.(params.agent.state.model.provider);
    checkGeneration(params);
    return await Promise.race([
      (async () => {
        const stream = await params.agent.streamFunction(params.agent.state.model, context, {
          apiKey: apiKey || undefined, timeoutMs: 60_000, signal: controller.signal, maxTokens,
        });
        return collectText(stream);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AppError("AI 服务响应超时，请稍后重试", "LLM_TIMEOUT", 502));
        }, 60_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    params.signal?.removeEventListener("abort", onAbort);
  }
}
