// 用途：对话回合编排（Agent 层，方向 agent → services）：准备阶段校验 Key 并落用户消息（流前执行，保证 400/404 以 JSON 返回）；
// 回复阶段查历史、跑 Agent、落回复（流中执行，经 onDelta 回调增量文本）。本层不接触 HTTP。
import { readKeysConfig } from "@/lib/config";
import { ValidationError } from "@/lib/errors";
import { getShop } from "@/services/shops.service";
import { getTurnHistory, recordAgentMessage, recordUserMessage } from "@/services/messages.service";
import { runAgentTurn } from "@/agent/execute";
import { buildSystemPrompt } from "@/agent/prompts/system";
import type { MessageView } from "@/types";

const FAUX_ENV = "KUAJING_AGENT_FAUX";

async function ensureLlmKey(): Promise<void> {
  if (process.env[FAUX_ENV] === "1") return;
  const keys = await readKeysConfig();
  if (!keys.llm.apiKey) {
    throw new ValidationError("尚未配置 DeepSeek API Key，请先在引导页完成配置后再对话。");
  }
}

// 准备阶段：校验 Key 与归属，用户消息落库并立即刷新活跃时间（断网时侧边栏也要正确排序）。
export async function prepareUserTurn(params: {
  conversationId: string;
  shopId: string;
  content: string;
}): Promise<MessageView> {
  await ensureLlmKey();
  return recordUserMessage(params);
}

// 回复阶段：携带历史跑 Agent（流式回调增量），成功后落库 Agent 消息。
export async function runAgentReply(params: {
  conversationId: string;
  shopId: string;
  content: string;
  userMessage: MessageView;
  onDelta: (text: string) => void;
}): Promise<MessageView> {
  const history = await getTurnHistory({
    conversationId: params.conversationId,
    shopId: params.shopId,
    before: params.userMessage.createdAt,
  });
  const shop = await getShop(params.shopId);
  const text = await runAgentTurn({
    systemPrompt: buildSystemPrompt({ name: shop.name, market: shop.market, description: shop.description }),
    history,
    content: params.content,
    onDelta: params.onDelta,
  });
  return recordAgentMessage({
    conversationId: params.conversationId,
    shopId: params.shopId,
    content: text,
  });
}
