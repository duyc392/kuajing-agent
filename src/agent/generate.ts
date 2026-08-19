// 用途：单次模型文本生成：复用 Agent 的 streamFunction 与模型配置（含按请求注入的 API Key），供业务工具（如文案生成）在工具执行期间调用模型；
// 并提供生成审计公共包装（每次 AI 调用留一条 Generation 记录）。
import type { Agent } from "@earendil-works/pi-agent-core";
import type { Context } from "@earendil-works/pi-ai";
import { logGeneration } from "@/services/audit.service";
import { AppError } from "@/lib/errors";
import type { GenerationInput } from "@/types";

// 把模型/网络层错误翻译成中文话术：连接类（PRD 指定文案）、鉴权类、限流类，其余给通用提示。
export function toFriendlyLlmError(raw: string | undefined): string {
  const text = (raw ?? "").toLowerCase();
  if (/connection|network|fetch failed|econnrefused|enotfound|timeout|etimedout|socket/.test(text)) {
    return "无法连接 AI 服务，请检查网络或代理后重试。";
  }
  if (/401|unauthorized|invalid.*key|authentication|api key/.test(text)) {
    return "AI 服务拒绝了请求：API Key 无效或已过期，请到设置页检查。";
  }
  if (/429|rate limit|quota|insufficient/.test(text)) {
    return "请求过于频繁或额度不足，请稍后重试。";
  }
  return "AI 服务暂时不可用，请稍后重试。";
}

export interface GenerateOnceParams {
  agent: Agent;
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

// 生成审计公共包装：成功与失败各记一条 Generation（PRD：每次 AI 调用留审计），审计失败只写日志、不影响主流程。
export async function callWithGenerationAudit(params: {
  shopId: string;
  type: GenerationInput["type"];
  modelId: string;
  prompt: string;
  call: () => Promise<string>;
}): Promise<string> {
  try {
    const output = await params.call();
    await logGeneration({
      shopId: params.shopId,
      type: params.type,
      model: params.modelId,
      prompt: params.prompt,
      output,
      status: "success",
    });
    return output;
  } catch (error) {
    await logGeneration({
      shopId: params.shopId,
      type: params.type,
      model: params.modelId,
      prompt: params.prompt,
      status: "error",
      error: error instanceof Error ? error.message : "未知错误",
    });
    throw error;
  }
}

export async function generateTextOnce(params: GenerateOnceParams): Promise<string> {
  const context: Context = {
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt, timestamp: Date.now() }],
  };
  // 直接调用 streamFunction 会绕过 Agent 的 Key 注入：这里手动按 provider 取 Key 传入请求选项；
  // 超时中止信号贯通到底层请求，中止后底层不再继续占用资源。
  const apiKey = await params.agent.getApiKey?.(params.agent.state.model.provider);
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  params.signal?.addEventListener("abort", onOuterAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stream = await params.agent.streamFunction(params.agent.state.model, context, {
      apiKey: apiKey || undefined,
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    let text = "";
    // 硬超时：与主对话一致，模型调用超过 60 秒直接报错返回，并中止底层请求。
    const TIMEOUT_MS = 60_000;
    await Promise.race([
      (async () => {
        for await (const event of stream) {
          if (event.type === "text_delta") text += event.delta;
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AppError("AI 服务响应超时，请稍后重试", "LLM_TIMEOUT", 502));
        }, TIMEOUT_MS);
      }),
    ]);
    const final = await stream.result();
    if (final.stopReason === "error" || final.stopReason === "aborted") {
      // 原始错误只进服务端日志；上层只收到中文话术，不透传服务商英文细节。
      console.error("[agent] 工具模型调用失败:", final.errorMessage);
      throw new AppError(toFriendlyLlmError(final.errorMessage), "LLM_ERROR", 502);
    }
    if (text.trim() === "") throw new AppError("模型没有返回任何内容，请重试", "LLM_EMPTY", 502);
    return text;
  } finally {
    if (timer) clearTimeout(timer);
    params.signal?.removeEventListener("abort", onOuterAbort);
  }
}
