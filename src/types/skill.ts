// 用途：Agent 技能业务域类型（PRD 故事 46-47）：技能正文存于根目录 skills/*.md 文件，名称/文件名/启用状态等管理信息存于 Prisma Skill 表；
// 技能不属于特定店铺，可启用/禁用，记录创建与修改时间。propose_skill 工具名与提议详情供对话确认卡片与工具注册共用。
// 内置 SOP 技能是纯数据（无 execute、无 IO）：只在加载时注入主 Agent 上下文，由主 Agent 按 SOP 调原子工具完成工作。
export const PROPOSE_SKILL_TOOL_NAME = "propose_skill";
export const LOAD_SKILL_TOOL_NAME = "load_skill";

/** 内置技能 ID 前缀：卖家技能不可覆盖同名内置技能，设置页对内置技能只读。 */
export const BUILTIN_SKILL_PREFIX = "builtin:";

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
  /** 内置 SOP 技能：只读，不可编辑/删除，恒为启用 */
  builtin: boolean;
  editable: boolean;
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

// 判断标准的校验方式：code=由确定性纯函数校验（如引文是否逐字命中），model=交给主 Agent 自检。
export type RubricCheck = "code" | "model";

export interface RubricItem {
  key: string;
  /** 权重（0-1），同一技能内总和为 1 */
  weight: number;
  /** true=硬性条件，不满足必须重做，不允许带缺陷交付 */
  hardGate: boolean;
  check: RubricCheck;
  description: string;
}

/**
 * 内置业务 SOP（Skill）：纯数据，没有 execute、不调用模型、不碰数据库。
 * 它被 load_skill 取回后进入主 Agent 的上下文，告诉主 Agent「按什么步骤做、用什么工具、怎么判断合格、交付成什么样」。
 */
export interface AgentSkillDefinition {
  /** builtin: 前缀，与卖家技能区分 */
  id: string;
  name: string;
  /** 目录行：主 Agent 据此判断何时加载本 SOP */
  description: string;
  /** 确定性兜底关键词（execute 层意图识别用） */
  triggers: string[];
  /** 本 SOP 允许调用的原子工具白名单 */
  tools: string[];
  /** 步骤化流程：第 1 步做什么、第 2 步做什么 */
  sop: string[];
  /** 交付格式要求：主 Agent 自己的输出必须包含的区块 */
  delivery: string[];
  /** 判断标准：交付前逐条自检 */
  rubric: RubricItem[];
  /** 参考范例：一段好例子 + 常见错误 */
  fewShot: string[];
  builtin: true;
  editable: false;
}
