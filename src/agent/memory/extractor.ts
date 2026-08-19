// 用途：记忆提取器（PRD 故事 41/42 与 5.2 技术约束）：每轮对话结束后用一次独立的低成本模型调用（memoryModel），
// 从本轮对话与最近几轮对话中提取"店铺画像 / 卖家偏好"候选条目（已有记忆作为去重参考），解析后经服务层去重写入。
// 每次调用记录生成审计（type=memory）；任何失败向上抛，由对话编排层决定是否静默降级。
import { callWithGenerationAudit } from "@/agent/generate";
import { escapePromptData } from "@/agent/prompts/escape";
import { formatMemoryItems } from "@/agent/prompts/memory";
import { isMemoryCategory, MAX_CONTEXT_MEMORIES, MAX_EXTRACT_CANDIDATES, MEMORY_CATEGORIES } from "@/config/memory";
import { addMemories, listMemories } from "@/services/memory.service";
import type { ExtractedMemoryCandidate, ExtractMemoriesResult, GenerateTextFn, HistoryItem, MemoryEntryView } from "@/types";

export interface ExtractMemoriesParams {
  shopId: string;
  turn: { user: string; assistant: string };
  recent: HistoryItem[]; // 本轮之前的最近几轮对话（用于识别反复出现的偏好，PRD 故事 41）
  generateText: GenerateTextFn;
  signal?: AbortSignal;
}

function buildExtractionSystemPrompt(): string {
  return [
    "你是跨境电商工作台的记忆提取助手，负责把卖家在对话中明确表达的信息沉淀为长期记忆。",
    `只提取两类信息：店铺画像（店铺定位、目标人群、运营习惯）与卖家偏好（内容风格、文案偏好）。分类只能取：${MEMORY_CATEGORIES.join(" / ")}。`,
    "提取规则：只提取卖家明确表达的事实或偏好，不推测、不编造；不提取一次性任务或对话过程本身；",
    "卖家的修改意见或要求在最近对话中反复出现（例如多次要求缩短标题）时，归纳为一条偏好（如「偏好简洁的短标题」）。",
    "内容写成一句可独立成立的中文句子（不超过 200 字），不要带「用户说」「卖家提到」一类前缀。",
    "本轮对话没有值得长期记住的信息时，输出空数组。",
    "只输出一个 JSON 对象，不要输出任何其他文字、代码块标记或解释，格式：",
    '{"memories":[{"category":"内容偏好","content":"偏好简洁的短标题"}]}',
  ].join("\n");
}

// 已有记忆给模型当去重参考（经 formatMemoryItems 转义，防记忆内容伪造数据区结束标记注入指令）；
// 对话内容为外部数据，先转义再进数据区。
function buildExtractionUserPrompt(turn: { user: string; assistant: string }, existing: MemoryEntryView[], recent: HistoryItem[]): string {
  const lines = [
    "该店铺已有的长期记忆（不要重复提取相同内容）：",
    `<memory_data>${formatMemoryItems(existing.slice(-MAX_CONTEXT_MEMORIES))}</memory_data>`,
  ];
  if (recent.length > 0) {
    lines.push("本轮之前的最近对话（用于识别反复出现的偏好）：", "<recent_data>");
    for (const item of recent.slice(-4)) {
      lines.push(`${item.role === "user" ? "卖家" : "助手"}：${escapePromptData(item.content)}`);
    }
    lines.push("</recent_data>");
  }
  lines.push(
    "本轮对话：",
    "<conversation_data>",
    `卖家：${escapePromptData(turn.user)}`,
    `助手：${escapePromptData(turn.assistant)}`,
    "</conversation_data>",
    "请直接输出 JSON。",
  );
  return lines.join("\n");
}

// 从模型输出中解析 JSON（容忍代码块围栏与前后杂文）；输出不含合法 memories 数组时抛中文错误（由编排层降级处理）。
// 数组中的畸形元素（null、数字等）逐条跳过，不影响其余合法候选。
function parseCandidates(text: string): ExtractedMemoryCandidate[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("记忆提取输出不是 JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("记忆提取输出 JSON 解析失败");
  }
  const obj = parsed as Record<string, unknown>;
  const raw = Array.isArray(obj.memories) ? obj.memories : [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => ({
      category: typeof item.category === "string" ? item.category.trim() : "",
      content: typeof item.content === "string" ? item.content.trim() : "",
    }))
    .filter((candidate): candidate is ExtractedMemoryCandidate =>
      isMemoryCategory(candidate.category) && candidate.content !== "" && candidate.content.length <= 500)
    .slice(0, MAX_EXTRACT_CANDIDATES);
}

export async function extractMemories(params: ExtractMemoriesParams): Promise<ExtractMemoriesResult> {
  const existing = await listMemories(params.shopId);
  const userPrompt = buildExtractionUserPrompt(params.turn, existing, params.recent);
  const text = await callWithGenerationAudit({
    shopId: params.shopId,
    type: "memory",
    modelId: params.generateText.modelId ?? "unknown",
    prompt: userPrompt,
    call: () => params.generateText(buildExtractionSystemPrompt(), userPrompt, params.signal),
  });
  const candidates = parseCandidates(text);
  const added = await addMemories(params.shopId, candidates);
  return { added, skippedCount: candidates.length - added.length };
}
