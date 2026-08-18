// 用途：执行一轮 Agent 对话：调用 Pi 运行"思考 → 回答"循环，流式回调增量文本，结束后返回完整回复（本阶段无工具调用）。
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createAgent } from "@/agent/core";
import { AppError } from "@/lib/errors";
import type { HistoryItem } from "@/types";


export interface RunAgentTurnParams {
  systemPrompt: string;
  history: HistoryItem[];
  content: string;
  onDelta?: (text: string) => void;
}

function toAgentMessages(history: HistoryItem[]): AgentMessage[] {
  return history.map((item) =>
    item.role === "user"
      ? { role: "user", content: item.content, timestamp: item.createdAt.getTime() }
      : {
          role: "assistant",
          content: [{ type: "text", text: item.content }],
          api: "openai-completions",
          provider: "deepseek",
          model: "deepseek-chat",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: item.createdAt.getTime(),
        },
  );
}

function extractText(messages: AgentMessage[]): string {
  const last = [...messages].reverse().find((message) => message.role === "assistant");
  if (!last || !Array.isArray(last.content)) return "";
  return last.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// 把模型/网络层错误翻译成中文话术：连接类（PRD 指定文案）、鉴权类、限流类，其余给通用提示。
function toFriendlyLlmError(raw: string | undefined): string {
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

export async function runAgentTurn(params: RunAgentTurnParams): Promise<string> {
  const agent = await createAgent({
    systemPrompt: params.systemPrompt,
    messages: toAgentMessages(params.history),
  });
  agent.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      params.onDelta?.(event.assistantMessageEvent.delta);
    }
  });
  // 硬超时：模型调用超过 60 秒直接报错返回，不再无限等待（PRD 未规定上限，60 秒足够正常回复）。
  const TIMEOUT_MS = 60_000;
  await Promise.race([
    agent.prompt(params.content),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AppError("AI 服务响应超时，请稍后重试", "LLM_TIMEOUT", 502)), TIMEOUT_MS),
    ),
  ]);
  const finalMessage = [...agent.state.messages].reverse().find((message) => message.role === "assistant");
  if (finalMessage && finalMessage.role === "assistant" && finalMessage.stopReason === "error") {
    // 原始错误只进服务端日志；前端只收到中文话术（PRD：断网显示"无法连接 AI 服务"），不透传服务商英文细节。
    console.error("[agent] 模型调用失败:", finalMessage.errorMessage);
    throw new AppError(toFriendlyLlmError(finalMessage.errorMessage), "LLM_ERROR", 502);
  }
  const text = extractText(agent.state.messages);
  if (text === "") throw new AppError("模型没有返回任何内容，请重试", "LLM_EMPTY", 502);
  return text;
}
