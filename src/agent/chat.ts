// 用途：对话回合编排（Agent 层，方向 agent → services）：准备阶段校验 Key 并落用户消息（流前执行，保证 400/404 以 JSON 返回）；
// 回复阶段查历史、跑 Agent、落回复（流中执行，经 onDelta 回调增量文本）。本层不接触 HTTP。
import { readKeysConfig } from "@/lib/config";
import { AppError, ValidationError } from "@/lib/errors";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { getShop } from "@/services/shops.service";
import { listMemories } from "@/services/memory.service";
import { getTurnHistory, recordAgentMessage, recordUserMessage, type TurnHistory } from "@/services/messages.service";
import { runAgentTurn } from "@/agent/execute";
import { createAgent } from "@/agent/core";
import { callWithGenerationAudit, generateTextOnce } from "@/agent/generate";
import { extractMemories } from "@/agent/memory/extractor";
import { escapePromptData } from "@/agent/prompts/escape";
import { buildSystemPrompt } from "@/agent/prompts/system";
import { loadSkillsBlock } from "@/agent/skills";
import { formatKnowledgeBlock, retrieveKnowledge } from "@/agent/knowledge";
import type { ChatStreamEvent, GenerateTextFn, HistoryItem, MemoryEntryView, MessageView } from "@/types";

const FAUX_ENV = "KUAJING_AGENT_FAUX";

async function ensureLlmKey(): Promise<void> {
  if (process.env[FAUX_ENV] === "1") return;
  const keys = await readKeysConfig();
  if (!keys.llm.apiKey) {
    throw new ValidationError("尚未配置 DeepSeek API Key，请先在引导页完成配置后再对话。");
  }
}

// 每个对话同时只允许一个进行中的回合：并行重复请求直接 429 拒绝，防止消息交错与重复计费。
const busyTurns = new Set<string>();

function acquireTurn(conversationId: string): void {
  if (busyTurns.has(conversationId)) {
    throw new AppError("该对话正在生成回复，请稍候再试", "TURN_BUSY", 429);
  }
  busyTurns.add(conversationId);
}

export function releaseTurn(conversationId: string): void {
  busyTurns.delete(conversationId);
}

// 全局 AI 并发信号量：单个本机部署也限制同时进行的模型调用数（跨对话并行刷请求会同时消耗 API 额度与 CPU/连接），
// 超过上限的回合排队等待；请求被客户端取消时从队列移除，不占名额。
const MAX_CONCURRENT_TURNS = 2;
let activeTurns = 0;
const turnWaiters: (() => void)[] = [];

function acquireTurnSlot(signal?: AbortSignal): Promise<void> {
  if (activeTurns < MAX_CONCURRENT_TURNS) {
    activeTurns += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      const index = turnWaiters.indexOf(waiter);
      if (index >= 0) turnWaiters.splice(index, 1);
      reject(new AppError("请求已取消", "REQUEST_ABORTED", 499));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort);
    turnWaiters.push(waiter);
  });
}

function releaseTurnSlot(): void {
  const next = turnWaiters.shift();
  if (next) next();
  else activeTurns -= 1;
}

// 准备阶段：校验 Key 与归属，用户消息落库并立即刷新活跃时间（断网时侧边栏也要正确排序）。
// 占用该对话的回合锁；失败时立即释放，成功后由 runAgentReply（或请求中断时由路由）释放。
export async function prepareUserTurn(params: {
  conversationId: string;
  shopId: string;
  content: string;
}): Promise<MessageView> {
  acquireTurn(params.conversationId);
  try {
    await ensureLlmKey();
    return await recordUserMessage(params);
  } catch (error) {
    releaseTurn(params.conversationId);
    throw error;
  }
}

export interface AgentReplyParams {
  conversationId: string;
  shopId: string;
  content: string;
  userMessage: MessageView;
  signal?: AbortSignal;
}

// 主动告知文案（PRD 故事 42）：新学到记忆时在回复末尾告诉卖家记住了什么；没有新增返回空字符串。
function buildMemoryNotice(added: MemoryEntryView[]): string {
  if (added.length === 0) return "";
  if (added.length === 1) {
    return `\n\n我注意到「${added[0].content}」，已经记住了，后续生成会自动参考。`;
  }
  const lines = added.map((memory) => `- ${memory.category}：${memory.content}`);
  return `\n\n我注意到以下新信息并已记住：\n${lines.join("\n")}\n后续生成会自动参考。`;
}

// 回合结束后的记忆提取（PRD 故事 41）：独立调用 memoryModel 提取本轮与最近几轮对话中新出现的店铺画像与偏好；
// 提取失败只记服务端日志并静默跳过，绝不阻断本轮对话。
async function extractTurnMemories(params: AgentReplyParams, text: string, recent: HistoryItem[]): Promise<string> {
  try {
    const keys = await readKeysConfig();
    const extractAgent = await createAgent({ systemPrompt: "", messages: [], model: keys.llm.memoryModel || undefined });
    const generateText: GenerateTextFn = Object.assign(
      (systemPrompt: string, userPrompt: string, signal?: AbortSignal) =>
        generateTextOnce({ agent: extractAgent, systemPrompt, userPrompt, signal }),
      { modelId: extractAgent.state.model.id },
    );
    const { added } = await extractMemories({
      shopId: params.shopId,
      turn: { user: params.content, assistant: text },
      recent,
      generateText,
      signal: params.signal,
    });
    return buildMemoryNotice(added);
  } catch (error) {
    console.error("[memory] 记忆提取失败（不影响本轮回复）:", error);
    return "";
  }
}

// 超限历史的摘要压缩（PRD 故事 39：上下文超限时自动压缩，保留关键信息）：
// 把被预算裁掉的旧消息压缩成不超过 200 字的中文摘要，作为一条标注消息放回历史头部；压缩失败则退回未压缩的历史。
async function buildContextHistory(params: AgentReplyParams, history: TurnHistory): Promise<HistoryItem[]> {
  if (history.dropped.length === 0) return history.items;
  try {
    const keys = await readKeysConfig();
    const summaryAgent = await createAgent({ systemPrompt: "", messages: [], model: keys.llm.memoryModel || undefined });
    const generateText: GenerateTextFn = Object.assign(
      (systemPrompt: string, userPrompt: string, signal?: AbortSignal) =>
        generateTextOnce({ agent: summaryAgent, systemPrompt, userPrompt, signal }),
      { modelId: summaryAgent.state.model.id },
    );
    const userPrompt = [
      "请把以下早期对话压缩成不超过 200 字的中文摘要，保留关键信息（店铺、商品、偏好、结论），去掉寒暄与过程：",
      ...history.dropped.map((item) => `${item.role === "user" ? "卖家" : "助手"}：${escapePromptData(item.content)}`),
    ].join("\n");
    const systemPrompt = "你是对话压缩助手，只输出摘要正文，不要任何解释或格式标记。";
    const summary = (await callWithGenerationAudit({
      shopId: params.shopId,
      type: "chat",
      modelId: generateText.modelId ?? "unknown",
      prompt: userPrompt,
      call: () => generateText(systemPrompt, userPrompt, params.signal),
    })).trim();
    if (summary === "") return history.items;
    return [
      { role: "user", content: `【早期对话摘要】${summary}`, createdAt: history.dropped[0].createdAt },
      ...history.items,
    ];
  } catch (error) {
    console.error("[chat] 历史压缩失败（继续使用未压缩历史）:", error);
    return history.items;
  }
}

// 执行一轮回复：查历史 → 压缩超限历史 → 跑 Agent → 提取记忆 → 落库，事件经 push 产出；结束回调用于释放回合锁与标记完成。
async function runReplyTurn(params: AgentReplyParams, push: (event: ChatStreamEvent) => void, onFinish: () => void): Promise<void> {
  let slotHeld = false;
  try {
    await acquireTurnSlot(params.signal);
    slotHeld = true;
    const history = await buildContextHistory(params, await getTurnHistory({
      conversationId: params.conversationId,
      shopId: params.shopId,
      before: params.userMessage.createdAt,
    }));
    const shop = await getShop(params.shopId);
    // 系统提示词注入当前店铺的长期记忆（PRD 故事 40：跨对话记住店铺信息，自动应用），并受条数上限约束。
    const memories = (await listMemories(params.shopId)).slice(-MAX_CONTEXT_MEMORIES);
    // 已启用技能注入系统提示词（PRD 故事 46/47：确认沉淀的技能自动复用，启用状态在设置页控制）。
    const skillsBlock = await loadSkillsBlock();
    // 领域知识（PRD 故事 33）：按本轮问题检索后垫在历史末尾、用户消息之前（[knowledge] 数据区，不落库）；
    // 不进系统提示词——知识按问题每轮不同，放前缀会击穿整段历史的缓存；未检索到时完全不注入。
    const knowledgeSections = await retrieveKnowledge(params.content);
    const postHistoryContext = knowledgeSections.length > 0
      ? `[knowledge]\n${formatKnowledgeBlock(knowledgeSections)}\n[/knowledge]`
      : undefined;
    const { text, toolCalls } = await runAgentTurn({
      systemPrompt: buildSystemPrompt({ name: shop.name, market: shop.market, description: shop.description, memories, skillsBlock }),
      history,
      content: params.content,
      shopId: params.shopId,
      postHistoryContext,
      signal: params.signal,
      onDelta: (event) => push({ type: "delta", text: event }),
      onToolStart: (call) => push({ type: "tool_start", call }),
      onToolEnd: (call) => push({ type: "tool_end", call }),
    });
    const notice = await extractTurnMemories(params, text, history);
    if (notice !== "") push({ type: "delta", text: notice });
    const agentMessage = await recordAgentMessage({
      conversationId: params.conversationId,
      shopId: params.shopId,
      content: text + notice,
      toolCalls,
    });
    push({ type: "done", agentMessage });
  } catch (error) {
    // 只透传 AppError（含 NotFound/Validation 子类）的用户安全消息；未知异常（Prisma/网络等）记服务端日志，前端只给固定提示，不泄露内部细节。
    if (error instanceof AppError) {
      push({ type: "error", error: error.message });
    } else {
      console.error("[chat] 回复失败（内部错误）:", error);
      push({ type: "error", error: "Agent 回复失败，请稍后重试" });
    }
  } finally {
    // 无论成功失败都释放回合锁与全局并发名额。
    if (slotHeld) releaseTurnSlot();
    releaseTurn(params.conversationId);
    onFinish();
  }
}

// 回复阶段（流式事件生成器）：携带历史跑 Agent，把工具调用事件、回复增量逐个产出，结束时产出 done（成功）或 error（失败）。
// 本层只产出类型化事件，不接触 HTTP；路由层负责把事件编码成 SSE 帧。
export async function* runAgentReplyEvents(params: AgentReplyParams): AsyncGenerator<ChatStreamEvent> {
  const queue: ChatStreamEvent[] = [];
  let finished = false;
  let notify: (() => void) | undefined;
  const push = (event: ChatStreamEvent) => {
    queue.push(event);
    if (notify) {
      notify();
      notify = undefined;
    }
  };
  const onFinish = () => {
    finished = true;
    if (notify) {
      notify();
      notify = undefined;
    }
  };
  void runReplyTurn(params, push, onFinish);
  while (true) {
    while (queue.length > 0) yield queue.shift() as ChatStreamEvent;
    if (finished) return;
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }
}
