// 用途：Agent 长期记忆业务域类型（PRD 故事 40-43）：记忆条目视图、编辑契约与提取候选结构。
// 记忆属于某个店铺（shopId 隔离铁律），分类口径见 src/config/memory.ts（类型直接引用 MemoryCategory）。
import type { MemoryCategory } from "@/config/memory";

export interface MemoryEntryView {
  id: string;
  shopId: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// 编辑契约：分类（白名单内）与内容（1-500 字）可改，二者至少提交其一。
export interface MemoryUpdateInput {
  category?: MemoryCategory;
  content?: string;
}

// 提取器输出的候选条目：分类必须在白名单内、内容为一句可独立成立的事实/偏好。
export interface ExtractedMemoryCandidate {
  category: MemoryCategory;
  content: string;
}

// 提取结果：实际新写入的条目数与重复跳过的候选数（供"主动告知"判断）。
export interface ExtractMemoriesResult {
  added: MemoryEntryView[];
  skippedCount: number;
}
