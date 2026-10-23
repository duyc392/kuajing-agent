// 用途：技能注入与加载：把「内置业务 SOP（数据）」与「卖家自定义技能（数据库 + skills/*.md）」合并后供主 Agent 使用。
// 常驻技能全文注入；按需技能与内置 SOP 只注入目录，完整内容由模型经 load_skill 取回。
// 注意：Skill 是上下文数据，没有执行逻辑——真正调工具、写库的是主 Agent。
import { escapePromptData } from "@/agent/prompts/escape";
import { BUILTIN_SKILLS, builtinCatalogLines, findBuiltinSkill, renderAgentSkill } from "@/agent/skills/registry";
import { MAX_ENABLED_SKILLS } from "@/config/skills";
import { listEnabledSkills } from "@/services/skills.service";
import { getEnabledSkillsByNames } from "@/services/skill-lookup.service";

export interface SkillsPromptBlock {
  /** 常驻技能行（含全文），注入后每轮直接生效 */
  resident: string[];
  /** 按需技能目录行（仅名称与适用说明），完整规则需模型调 load_skill 获取 */
  onDemand: string[];
  /** 内置业务 SOP 目录行 */
  builtinCatalog: string[];
}

export interface LoadedSkill {
  name: string;
  source: "builtin" | "seller";
  content: string;
  tools: string[];
}

export async function loadSkillsBlock(): Promise<SkillsPromptBlock> {
  const skills = (await listEnabledSkills()).slice(0, MAX_ENABLED_SKILLS);
  return {
    resident: skills
      .filter((skill) => skill.alwaysApply)
      .map((skill) => `- 【${escapePromptData(skill.name)}】${escapePromptData(skill.content)}`),
    onDemand: skills
      .filter((skill) => !skill.alwaysApply)
      .map((skill) => `- 【${escapePromptData(skill.name)}】${escapePromptData(skill.description === "" ? "（无说明）" : skill.description)}`),
    builtinCatalog: builtinCatalogLines(),
  };
}

// 生成流水线（选品工作台直调模型）注入用的常驻规则行：只取常驻技能——单次模型调用没有工具循环，按需技能加载不了。
export async function loadResidentSkillRules(): Promise<string[]> {
  return (await loadSkillsBlock()).resident;
}

// 按名加载：内置 SOP 优先（ID 或中文名精确匹配），未命中再查卖家已启用技能。
export async function loadSkillsByNames(names: string[]): Promise<{ found: LoadedSkill[]; missing: string[] }> {
  const found: LoadedSkill[] = [];
  const missing: string[] = [];
  const sellerNames: string[] = [];
  const requested = names.map((name) => name.trim()).filter((name) => name !== "");
  for (const name of requested) {
    const builtin = findBuiltinSkill(name);
    if (builtin) {
      found.push({ name: builtin.name, source: "builtin", content: renderAgentSkill(builtin).join("\n"), tools: builtin.tools });
    } else {
      sellerNames.push(name);
    }
  }
  if (sellerNames.length > 0) {
    const seller = await getEnabledSkillsByNames(sellerNames);
    for (const skill of seller.found) {
      found.push({ name: skill.name, source: "seller", content: skill.content, tools: [] });
    }
    missing.push(...seller.missing);
  }
  return { found, missing };
}

export { BUILTIN_SKILLS };
