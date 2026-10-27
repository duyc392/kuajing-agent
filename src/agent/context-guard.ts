// 用途：每次模型请求前检查整段上下文（含工具轮），超限明确失败，不裁用户消息或破坏toolcall/result配对。
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import { createContextBudget, estimateContextTokens } from "@/lib/conversation-context";
import { AppError } from "@/lib/errors";

const failures = new WeakMap<Agent, AppError>();
const installed = new WeakSet<Agent>();

function messageTokens(message: AgentMessage): number {
  if (!("content" in message)) return estimateContextTokens(JSON.stringify(message)) + 128;
  if (typeof message.content === "string") return estimateContextTokens(message.content) + 128;
  if (!Array.isArray(message.content)) return estimateContextTokens(JSON.stringify(message.content)) + 128;
  return message.content.reduce((sum, block) => sum + estimateContextTokens(
    block.type === "text" ? block.text : JSON.stringify(block),
  ), 128);
}

export function installContextGuard(agent: Agent): void {
  if (installed.has(agent)) return;
  installed.add(agent);
  const previous = agent.transformContext;
  agent.transformContext = async (messages, signal) => {
    if (signal?.aborted) throw new AppError("请求已取消", "REQUEST_ABORTED", 499);
    const transformed = previous ? await previous(messages, signal) : messages;
    const budget = createContextBudget({ model: agent.state.model, systemPrompt: agent.state.systemPrompt,
      tools: agent.state.tools, content: "" });
    const used = transformed.reduce((sum, message) => sum + messageTokens(message), 0);
    // fixedTokens含空的当前user信封；这里实际消息已经包含当前user，不重复计算。
    if (used + budget.fixedTokens - estimateContextTokens("") - 128 > budget.inputLimit) {
      const error = new AppError("上下文已达到模型容量，无法安全继续，请缩短本轮输入或开启新对话", "CONTEXT_LIMIT", 422);
      failures.set(agent, error);
      throw error;
    }
    return transformed;
  };
}

export function assertContextGuard(agent: Agent): void {
  const failure = failures.get(agent);
  if (failure) throw failure;
}
