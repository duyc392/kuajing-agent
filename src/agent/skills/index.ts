// 用途：技能提示词注入（PRD 故事 46 复用 + 故事 47 启用/禁用）：读取已启用技能并格式化为系统提示词的 skill_data 区块。
// 技能正文与名称属于卖家沉淀的数据，先转义再进数据区，防止伪造结束标记注入指令。
import { escapePromptData } from "@/agent/prompts/escape";
import { MAX_ENABLED_SKILLS } from "@/config/skills";
import { listEnabledSkills } from "@/services/skills.service";

export async function loadSkillsBlock(): Promise<string> {
  const skills = (await listEnabledSkills()).slice(0, MAX_ENABLED_SKILLS);
  if (skills.length === 0) return "（暂无已启用技能）";
  return skills.map((skill) => `- 【${escapePromptData(skill.name)}】${escapePromptData(skill.content)}`).join("\n");
}
