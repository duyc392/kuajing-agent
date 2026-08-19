// 用途：Agent 长期记忆的静态配置：记忆分类白名单（PRD 故事 43：分类存储店铺画像与用户偏好）与记忆规模上限。
// 提取器只能输出这些分类，设置页按这些分类分组展示，保证分类口径全系统一致；
// 上限防止记忆无限增长拖垮每次对话的提示词与模型费用（PRD 5.3 性能约束）。
export const MEMORY_CATEGORIES = ["店铺定位", "目标人群", "内容偏好", "运营习惯"] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export function isMemoryCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

export const MAX_CONTEXT_MEMORIES = 20; // 注入对话/生成流程的记忆条数上限（每条内容上限 500 字）
export const MAX_EXTRACT_CANDIDATES = 10; // 单轮提取最多写入的候选条数
