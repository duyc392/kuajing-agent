// 用途：执行一轮 Agent 对话：调用 Pi 运行"思考 → 回答"循环，流式回调增量文本，注入业务工具并收集工具调用记录，结束后返回完整回复与工具记录。
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import { createAgent } from "@/agent/core";
import { toFriendlyLlmError } from "@/agent/generate";
import { buildAgentTools } from "@/agent/tools";
import { prepareConversationContext } from "@/agent/context";
import { assertContextGuard, installContextGuard } from "@/agent/context-guard";
import { AppError } from "@/lib/errors";
import type { HistoryItem, ToolCallRecord } from "@/types";

export interface RunAgentTurnParams {
  systemPrompt: string;
  history?: HistoryItem[];
  preparedAgent?: Agent;
  conversationId?: string;
  currentMessageId?: string;
  content: string;
  shopId: string;
  signal?: AbortSignal;
  // 历史之后、本轮消息之前的临时上下文（如按本轮问题检索的领域知识）：作为一条用户角色消息注入，
  // 不落库、不进系统提示词——保证系统提示词与历史构成稳定前缀（DeepSeek 前缀缓存友好）。
  postHistoryContext?: string;
  onDelta?: (text: string) => void;
  onToolStart?: (call: ToolCallRecord) => void;
  onToolEnd?: (call: ToolCallRecord) => void;
}

export interface RunAgentTurnResult {
  text: string;
  toolCalls: ToolCallRecord[];
  history: HistoryItem[];
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
          model: "deepseek-v4-flash",
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
      // 工具执行异常的原始结果只记服务端日志，前端卡片只展示脱敏后的中文提示，不泄露内部细节。
      if (event.isError) console.error("[agent] 工具执行失败:", event.toolName, event.result);
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
    assertContextGuard(agent);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 意图兜底：这些意图必须真正调用对应工具，防止模型口头声称"基于数据"却没有取数/落库。
// 键为工具名，值为识别该意图的正则；命中后若本轮没调过该工具，注入指令再跑一轮。
const REQUIRED_TOOL_RULES: Array<{ tool: string; pattern: RegExp; label: string }> = [
  { tool: "fetch_market_data", pattern: /市场.{0,6}(分析|调研|机会|容量|规模|空间|前景|行情)|选品方向|选品推荐|品类.{0,6}(分析|机会)/, label: "大盘数据" },
  { tool: "fetch_competitor_shop", pattern: /竞品|同行|对手店铺|竞对|对标/, label: "竞品店铺数据" },
  { tool: "fetch_video_source", pattern: /拉片|拆解.{0,4}(视频|爆款)|为什么.{0,2}火/, label: "竞品视频" },
  { tool: "fetch_product_reviews", pattern: /差评|评论分析|痛点提炼|用户评价/, label: "商品评论" },
];

function requiredTool(content: string): { tool: string; label: string } | null {
  for (const rule of REQUIRED_TOOL_RULES) {
    if (rule.pattern.test(content)) return { tool: rule.tool, label: rule.label };
  }
  return null;
}

// 意图兜底：该用工具却没有工具调用时，注入明确指令再跑一轮；仍不调用则报错，绝不保存"编造的数据结论"。
async function enforceRequiredTool(agent: Agent, content: string, toolCalls: ToolCallRecord[]): Promise<void> {
  const required = requiredTool(content);
  if (required === null) return;
  if (toolCalls.some((call) => call.toolName === required.tool)) return;
  await promptOnce(agent, {
    role: "user",
    content: `必须调用 ${required.tool} 获取${required.label}后再回答，不得编造任何数据结论。`,
    timestamp: Date.now(),
  });
  if (toolCalls.some((call) => call.toolName === required.tool)) return;
  throw new AppError(`本次请求需要${required.label}，但没有成功获取。请补充必要信息后重试。`, "TOOL_REQUIRED", 422);
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError("请求已取消", "REQUEST_ABORTED", 499);
}

async function prepareTurnAgent(params: RunAgentTurnParams): Promise<{ agent: Agent; history: HistoryItem[] }> {
  assertNotAborted(params.signal);
  const agent = params.preparedAgent ?? await createAgent({ systemPrompt: params.systemPrompt, messages: [] });
  agent.state.systemPrompt = params.systemPrompt;
  agent.state.tools = buildAgentTools({ shopId: params.shopId, conversationId: params.conversationId, beforeMessageId: params.currentMessageId });
  // 外部注入的测试Agent也必须接受同样的工具轮容量保护。
  if (params.preparedAgent) installContextGuard(agent);
  let history = params.history ?? [];
  let recent = history;
  if (params.conversationId && params.currentMessageId) {
    const context = await prepareConversationContext({ agent, conversationId: params.conversationId,
      beforeMessageId: params.currentMessageId, shopId: params.shopId, content: params.content,
      postHistoryContext: params.postHistoryContext, signal: params.signal });
    history = context.history;
    recent = context.recent;
  }
  const messages = toAgentMessages(history);
  if (params.postHistoryContext) messages.push({ role: "user", content: params.postHistoryContext, timestamp: Date.now() });
  agent.state.messages = messages;
  assertNotAborted(params.signal);
  // 记忆提取只消费最近原文，不能把有损摘要误当成卖家在最近几轮明确表达的原话。
  return { agent, history: recent };
}

function turnText(agent: Agent): string {
  const finalMessage = [...agent.state.messages].reverse().find((message) => message.role === "assistant");
  if (finalMessage?.role === "assistant" && finalMessage.stopReason === "error") {
    console.error("[agent] 模型调用失败:", finalMessage.errorMessage);
    throw new AppError(toFriendlyLlmError(finalMessage.errorMessage), "LLM_ERROR", 502);
  }
  const text = extractText(agent.state.messages);
  if (!text) throw new AppError("模型没有返回任何内容，请重试", "LLM_EMPTY", 502);
  return text;
}

export async function runAgentTurn(params: RunAgentTurnParams): Promise<RunAgentTurnResult> {
  const { agent, history } = await prepareTurnAgent(params);
  const labels = new Map(agent.state.tools.map((tool) => [tool.name, tool.label]));
  const argsByCall = new Map<string, unknown>();
  const toolCalls: ToolCallRecord[] = [];
  wireAgentEvents(agent, params, labels, argsByCall, toolCalls);
  // 客户端断开 / 超时都会中止 Agent：底层模型流与正在执行的工具一并取消，防止后台继续调工具写库。
  const onOuterAbort = () => agent.abort();
  params.signal?.addEventListener("abort", onOuterAbort);
  try {
    assertNotAborted(params.signal);
    await promptOnce(agent, { role: "user", content: params.content, timestamp: Date.now() });
    assertNotAborted(params.signal);
    // 意图兜底：需要真实数据却未调用对应工具时，注入指令重试一轮，仍失败则明确报错。
    await enforceRequiredTool(agent, params.content, toolCalls);
  } finally {
    params.signal?.removeEventListener("abort", onOuterAbort);
  }
  return { text: turnText(agent), toolCalls, history };
}
