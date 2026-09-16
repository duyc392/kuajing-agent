// 用途：技能提示词注入（PRD 故事 46 复用 + 故事 47 启用/禁用）：读取已启用技能并按常驻/按需分成两段——
// 常驻技能全文注入（始终生效的偏好规则），按需技能只注入「名称：适用说明」目录，完整规则由模型经 load_skill 工具按需取回。
// 技能正文与名称属于卖家沉淀的数据，先转义再进数据区，防止伪造结束标记注入指令。
import { escapePromptData } from "@/agent/prompts/escape";
import { MAX_ENABLED_SKILLS } from "@/config/skills";
import { listEnabledSkills } from "@/services/skills.service";

export interface SkillsPromptBlock {
  /** 常驻技能行（含全文），注入后每轮直接生效 */
  resident: string[];
  /** 按需技能目录行（仅名称与适用说明），完整规则需模型调 load_skill 获取 */
  onDemand: string[];
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
  };
}

// 生成流水线（文案/视频脚本/直播脚本）注入用的常驻规则行：只取常驻技能——生成调用是单次模型调用、无工具循环，
// 按需技能无法被生成模型加载，其定位就是省 token 的对话内按需内容。
export async function loadResidentSkillRules(): Promise<string[]> {
  return (await loadSkillsBlock()).resident;
}
