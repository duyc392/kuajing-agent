// 用途：长期记忆提示词格式化（PRD 故事 40：记忆注入对话与生成流程）：把记忆条目格式化为提示词数据区内的行，
// 外部数据一律转义，防止伪造数据区结束标记注入指令。
import { escapePromptData } from "@/agent/prompts/escape";

export interface MemoryContextItem {
  category: string;
  content: string;
}

// 每条记忆一行（"分类：内容"），供 <memory_data> 数据区或各生成提示词的 product_data 区复用。
export function formatMemoryItems(memories: MemoryContextItem[]): string {
  if (memories.length === 0) return "（暂无长期记忆）";
  return memories.map((memory) => `- ${escapePromptData(memory.category)}：${escapePromptData(memory.content)}`).join("\n");
}
