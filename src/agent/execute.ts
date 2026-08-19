// 用途：执行一轮 Agent 对话：调用 Pi 运行"思考 → 回答"循环，流式回调增量文本，注入业务工具并收集工具调用记录，结束后返回完整回复与工具记录。
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import { createAgent } from "@/agent/core";
import { generateTextOnce, toFriendlyLlmError } from "@/agent/generate";
import { buildAgentTools } from "@/agent/tools";
import { AppError } from "@/lib/errors";
import type { GenerateTextFn, HistoryItem, ToolCallRecord } from "@/types";

export interface RunAgentTurnParams {
  systemPrompt: string;
  history: HistoryItem[];
  content: string;
  shopId: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onToolStart?: (call: ToolCallRecord) => void;
  onToolEnd?: (call: ToolCallRecord) => void;
}

export interface RunAgentTurnResult {
  text: string;
  toolCalls: ToolCallRecord[];
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

// 工具失败结果 → 中文提示（给前端错误卡片与落库记录使用）。
function toolErrorText(result: { content?: unknown } | undefined): string {
  const content = result?.content;
  if (!Array.isArray(content)) return "工具执行失败，请重试";
  const text = content
    .filter((block): block is { type: "text"; text: string } => (block as { type?: string }).type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join(" ")
    .trim();
  return text === "" ? "工具执行失败，请重试" : text;
}

// 订阅 Agent 事件：文本增量、工具开始/结束（含参数与结果记录），工具记录收集进 toolCalls。
function wireAgentEvents(
  agent: Agent,
  params: RunAgentTurnParams,
  labels: Map<string, string>,
  argsByCall: Map<string, unknown>,
  toolCalls: ToolCallRecord[],
): void {
  agent.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent && event.assistantMessageEvent.type === "text_delta") {
      params.onDelta?.(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      argsByCall.set(event.toolCallId, event.args);
      params.onToolStart?.({
        id: event.toolCallId,
        toolName: event.toolName,
        label: labels.get(event.toolName) ?? event.toolName,
        args: event.args,
        status: "running",
      });
    }
    if (event.type === "tool_execution_end") {
      const record: ToolCallRecord = {
        id: event.toolCallId,
        toolName: event.toolName,
        label: labels.get(event.toolName) ?? event.toolName,
        args: argsByCall.get(event.toolCallId),
        status: event.isError ? "error" : "done",
        details: event.isError ? undefined : (event.result as { details?: unknown } | undefined)?.details,
        error: event.isError ? toolErrorText(event.result) : undefined,
      };
      toolCalls.push(record);
      params.onToolEnd?.(record);
    }
  });
}

// 主回合硬超时：180 秒是整体上限（图片生成等慢工具需要 60-90 秒）；
// 各环节仍有自己的内部超时兜底（模型流 60s、图片接口 90s/张、FastMoss 30s），此值只作最后防线。
const PROMPT_TIMEOUT_MS = 180_000;

// 一次带硬超时的 Agent 回合：超时中止模型流与工具，防止后台继续消耗资源。
async function promptOnce(agent: Agent, content: AgentMessage): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      agent.prompt(content),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          agent.abort();
          reject(new AppError("AI 服务响应超时，请稍后重试", "LLM_TIMEOUT", 502));
        }, PROMPT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 选品意图 → 必须调用的工具（PRD 故事 13-15 的兜底约束）：
// 模型可能口头声称"基于 FastMoss 数据"却不调用工具，这里用确定性规则识别意图，把工具调用变成硬性要求。
const SELECTION_INTENT_RULES: Array<{ tool: string; pattern: RegExp }> = [
  { tool: "analyze_market", pattern: /市场.{0,6}(分析|调研|机会|容量|规模|空间|前景|行情)|选品调研|品类.{0,6}(分析|机会)/ },
  { tool: "recommend_products", pattern: /选品方向|选品推荐|选品建议|跟卖|蓝海|推荐.{0,8}(品类|选品|方向|品)/ },
  { tool: "analyze_competitor", pattern: /竞品|同行|对手店铺|竞对|对标|拆解/ },
];

function requiredSelectionTool(content: string): string | null {
  for (const rule of SELECTION_INTENT_RULES) {
    if (rule.pattern.test(content)) return rule.tool;
  }
  return null;
}

// 选品意图兜底：该用工具却没有工具调用时，注入明确指令再跑一轮；仍不调用则报错，绝不保存"编造的数据结论"。
async function enforceSelectionTool(agent: Agent, content: string, toolCalls: ToolCallRecord[]): Promise<void> {
  const required = requiredSelectionTool(content);
  if (required === null) return;
  if (toolCalls.some((call) => call.toolName === required)) return;
  await promptOnce(agent, {
    role: "user",
    content: `必须调用 ${required} 工具获取 FastMoss 数据后再回答，不得编造任何数据结论。`,
    timestamp: Date.now(),
  });
  if (toolCalls.some((call) => call.toolName === required)) return;
  throw new AppError("本次请求需要 FastMoss 选品数据，但没有成功获取。请明确说出要分析的品类或竞品店铺名称后重试。", "SELECTION_TOOL_REQUIRED", 422);
}

export async function runAgentTurn(params: RunAgentTurnParams): Promise<RunAgentTurnResult> {
  const agent = await createAgent({
    systemPrompt: params.systemPrompt,
    messages: toAgentMessages(params.history),
  });
  const generateText: GenerateTextFn = Object.assign(
    (systemPrompt: string, userPrompt: string, signal?: AbortSignal) =>
      generateTextOnce({ agent, systemPrompt, userPrompt, signal }),
    { modelId: agent.state.model.id },
  );
  agent.state.tools = buildAgentTools({
    shopId: params.shopId,
    generateText,
  });
  const labels = new Map(agent.state.tools.map((tool) => [tool.name, tool.label]));
  const argsByCall = new Map<string, unknown>();
  const toolCalls: ToolCallRecord[] = [];
  wireAgentEvents(agent, params, labels, argsByCall, toolCalls);
  // 客户端断开 / 超时都会中止 Agent：底层模型流与正在执行的工具一并取消，防止后台继续调工具写库。
  const onOuterAbort = () => agent.abort();
  params.signal?.addEventListener("abort", onOuterAbort);
  try {
    await promptOnce(agent, { role: "user", content: params.content, timestamp: Date.now() });
    // 选品意图兜底：需要 FastMoss 数据却未调用对应工具时，注入指令重试一轮，仍失败则明确报错。
    await enforceSelectionTool(agent, params.content, toolCalls);
  } finally {
    params.signal?.removeEventListener("abort", onOuterAbort);
  }
  const finalMessage = [...agent.state.messages].reverse().find((message) => message.role === "assistant");
  if (finalMessage && finalMessage.role === "assistant" && finalMessage.stopReason === "error") {
    // 原始错误只进服务端日志；前端只收到中文话术（PRD：断网显示"无法连接 AI 服务"），不透传服务商英文细节。
    console.error("[agent] 模型调用失败:", finalMessage.errorMessage);
    throw new AppError(toFriendlyLlmError(finalMessage.errorMessage), "LLM_ERROR", 502);
  }
  const text = extractText(agent.state.messages);
  if (text === "") throw new AppError("模型没有返回任何内容，请重试", "LLM_EMPTY", 502);
  return { text, toolCalls };
}
