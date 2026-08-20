// 用途：Agent 技能的静态配置：字段长度、文件大小与数量上限（PRD 故事 46-47）。
// 服务层与 API 层共用这些常量，避免校验口径与魔法数字分散；上限防止技能无限增长拖垮提示词与 token 费用。
export const SKILL_NAME_MAX = 50;
export const SKILL_DESCRIPTION_MAX = 200;
export const SKILL_PROMPT_MAX = 2000;
export const SKILL_FILE_MAX_BYTES = 32768; // 单个技能 .md 文件大小上限（32KB）
export const MAX_SKILLS = 50; // 技能总数上限（含已禁用）
// 已启用技能上限，同时就是注入上下文的条数上限：两处共用同一常量，消除「设置页显示已启用但实际不生效」的不一致。
export const MAX_ENABLED_SKILLS = 20;
