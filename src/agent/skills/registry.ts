// 用途：内置 Skill 注册表：只做「列出、按名查找、渲染成提示词文本」，不执行任何逻辑。
// 内置 Skill 是代码里的常量数据，卖家技能是数据库 + skills/*.md；两者在加载时合并，内置用 builtin: 前缀防止覆盖。
import { audienceInsightsSkill } from "@/agent/skills/audience-insights";
import { localizedStoryboardSkill } from "@/agent/skills/localized-storyboard";
import { videoDeconstructionSkill } from "@/agent/skills/video-deconstruction";
import type { AgentSkillDefinition } from "@/types";

export const BUILTIN_SKILLS: AgentSkillDefinition[] = [
  videoDeconstructionSkill,
  audienceInsightsSkill,
  localizedStoryboardSkill,
];

export function listBuiltinSkills(): AgentSkillDefinition[] {
  return BUILTIN_SKILLS;
}

// 支持两种写法：完整 ID（builtin:xxx）或技能中文名，方便模型按目录里看到的原文加载。
export function findBuiltinSkill(key: string): AgentSkillDefinition | null {
  const trimmed = key.trim();
  return BUILTIN_SKILLS.find((skill) => skill.id === trimmed || skill.name === trimmed) ?? null;
}

// 目录行：只给名称、适用场景与允许的工具，正文等 load_skill 时再取，避免每轮都塞满上下文。
export function builtinCatalogLines(): string[] {
  return BUILTIN_SKILLS.map(
    (skill) => `- 【${skill.name}】${skill.description}（id：${skill.id}；可用工具：${skill.tools.join("、")}）`,
  );
}

function rubricLine(skill: AgentSkillDefinition): string[] {
  return skill.rubric.map(
    (item) => `- ${item.key}｜权重 ${item.weight}｜${item.hardGate ? "硬性" : "参考"}｜${item.check === "code" ? "由工具校验" : "自行检查"}：${item.description}`,
  );
}

// 渲染成注入文本：步骤 → 交付格式 → 判断标准 → 范例 → 工具白名单，顺序固定，便于模型照着做。
export function renderAgentSkill(skill: AgentSkillDefinition): string[] {
  return [
    `【${skill.name}】（${skill.id}）`,
    `适用：${skill.description}`,
    "本 SOP 只允许调用这些工具：" + skill.tools.join("、"),
    "执行步骤：",
    ...skill.sop,
    "交付格式（必须逐块给出）：",
    ...skill.delivery,
    "交付前自检（硬性项不满足必须重做）：",
    ...rubricLine(skill),
    "参考范例：",
    ...skill.fewShot,
  ];
}
