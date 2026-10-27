// 用途：无 IO 的上下文预算和完整轮次选择。估算刻意保守：ASCII 每字符1 token、非ASCII按UTF8字节，再加余量。
import { readContextSettings, type ContextSettings } from "@/config/context";
import type { ContextBudget, ContextHistoryPlan, ContextMessage, ContextModelCapacity, ContextToolMetadata } from "@/types/context";

interface BudgetParams {
  model: ContextModelCapacity;
  systemPrompt: string;
  tools: ContextToolMetadata[];
  content: string;
  postHistoryContext?: string;
  settings?: ContextSettings;
}

export function estimateContextTokens(value: string): number {
  // UTF8字节数是token数的保守上界近似，包含序列化与角色信封的固定开销。
  return Math.ceil(Buffer.byteLength(value, "utf8") * readContextSettings().estimateMargin) + 16;
}

export function createContextBudget(params: BudgetParams): ContextBudget {
  const settings = params.settings ?? readContextSettings();
  const outputReserve = Math.min(settings.outputTokens, params.model.maxTokens);
  const fixedTokens = estimateContextTokens(params.systemPrompt)
    + estimateContextTokens(JSON.stringify(params.tools))
    + estimateContextTokens(params.content) + 128
    + (params.postHistoryContext ? estimateContextTokens(params.postHistoryContext) + 128 : 0);
  const inputLimit = params.model.contextWindow - outputReserve - settings.safetyTokens - settings.toolReserveTokens;
  return {
    capacity: params.model.contextWindow, outputReserve, fixedTokens, inputLimit,
    safetyReserve: settings.safetyTokens, toolReserve: settings.toolReserveTokens,
    historyTokens: Math.max(0, inputLimit - fixedTokens),
  };
}

export function historyTokenEstimate(messages: ContextMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateContextTokens(message.content) + 128, 0);
}

function turnStarts(messages: ContextMessage[]): number[] {
  const starts = [0];
  messages.forEach((message, index) => {
    if (index > 0 && message.role === "user") starts.push(index);
  });
  return starts;
}

export function planContextHistory(messages: ContextMessage[], availableTokens: number): ContextHistoryPlan {
  const starts = turnStarts(messages);
  let start = 0;
  let estimatedTokens = historyTokenEstimate(messages);
  for (const boundary of starts.slice(1)) {
    if (estimatedTokens <= availableTokens) break;
    estimatedTokens -= historyTokenEstimate(messages.slice(start, boundary));
    start = boundary;
  }
  return {
    retained: messages.slice(start), compact: messages.slice(0, start), estimatedTokens,
    fits: estimatedTokens <= availableTokens,
  };
}

export function isAfterCursor(message: ContextMessage, cursor: { id: string; createdAt: Date }): boolean {
  return message.createdAt.getTime() > cursor.createdAt.getTime()
    || (message.createdAt.getTime() === cursor.createdAt.getTime() && message.id > cursor.id);
}
