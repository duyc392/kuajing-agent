// 用途：上下文测试专用离线Agent与数据，不访问真实配置或远端。
import type { ContextMessage, StructuredConversationSummary } from "@/types/context";

export const TEST_CONTEXT_SETTINGS = { fallbackCapacity: 12000, fallbackMaxTokens: 512, outputTokens: 512,
  safetyTokens: 128, toolReserveTokens: 256, summaryTokens: 512, estimateMargin: 1.25 };

export async function contextTestAgent(capacity = 12000) {
  const { Agent } = await import("@earendil-works/pi-agent-core");
  const { createModels, fauxProvider } = await import("@earendil-works/pi-ai");
  const faux = fauxProvider({ tokensPerSecond: 1000000,
    models: [{ id: "context-test", contextWindow: capacity, maxTokens: 512 }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const agent = new Agent({ initialState: { model: faux.getModel(), systemPrompt: "测试system", messages: [] },
    streamFn: models.streamSimple.bind(models) });
  return { agent, faux };
}

export function contextTestMessages(count = 42): ContextMessage[] {
  return Array.from({ length: count }, (_, i) => ({ id: `m${String(i).padStart(3, "0")}`,
    role: i % 2 ? "agent" : "user", createdAt: new Date(i), content: `原文${i}：` + "a".repeat(200) }));
}

export function contextTestSummary(goal = "早期目标SKU-1，禁止提价"): string {
  const summary: StructuredConversationSummary = { goals: [goal], constraints: ["禁止提价"], factsAndIds: ["SKU-1"],
    decisions: [], pending: ["待确认"], originalReferences: ["m000需回查原文"] };
  return JSON.stringify(summary);
}
