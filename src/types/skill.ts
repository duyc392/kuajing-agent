// 用途：Agent 技能业务域类型（PRD 故事 46-47）：技能正文存于根目录 skills/*.md 文件，名称/文件名/启用状态等管理信息存于 Prisma Skill 表；
// 技能不属于特定店铺，可启用/禁用，记录创建与修改时间。propose_skill 工具名与提议详情供对话确认卡片与工具注册共用。
export const PROPOSE_SKILL_TOOL_NAME = "propose_skill";
export const LOAD_SKILL_TOOL_NAME = "load_skill";

export interface SkillView {
  id: string;
  name: string;
  /** skills/ 目录下的文件名，如 "示例-美式口语化文案.md" */
  filename: string;
  description: string;
  /** 技能正文：skills/<filename> 的 .md 内容，注入系统提示词时按数据转义处理 */
  content: string;
  /** 常驻开关：true=每轮全文注入系统提示词；false=只列目录，模型判断相关时经 load_skill 工具按需加载 */
  alwaysApply: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCreateInput {
  name: string;
  description: string;
  /** 技能规则正文，写入 .md 文件的「## 规则」段 */
  prompt: string;
  /** 常驻开关，缺省 true；常驻技能每轮全文注入，按需技能只列目录、用 load_skill 加载 */
  alwaysApply?: boolean;
}

export interface SkillUpdateInput {
  enabled?: boolean;
  alwaysApply?: boolean;
}

// 提议沉淀技能的工具返回的结构化详情：拟创建的技能内容，由确认卡片交卖家确认后才真正创建（确认后技能才创建）。
export interface SkillProposalDetails {
  name: string;
  description: string;
  prompt: string;
  alwaysApply: boolean;
}

// load_skill 工具返回的结构化详情：仅记录加载与未找到的技能名（全文只发给模型，不进落库详情）。
export interface LoadSkillToolDetails {
  loaded: string[];
  missing: string[];
}
