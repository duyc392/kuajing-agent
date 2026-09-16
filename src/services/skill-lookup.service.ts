// 用途：按名称加载已启用技能（load_skill 工具的专用查询）：供 Agent 按需取回按需技能的完整规则；
// 名称用目录中的原文精确匹配（去首尾空白），未命中与已禁用的名称一并返回给工具，由模型提示卖家而不是编造内容。
import { listEnabledSkills } from "@/services/skills.service";
import type { SkillView } from "@/types";

export interface SkillLookupResult {
  found: SkillView[];
  /** 未命中的名称（不存在、已禁用、正文文件缺失都会落在这里） */
  missing: string[];
}

export async function getEnabledSkillsByNames(names: string[]): Promise<SkillLookupResult> {
  const wanted = [...new Set(names.map((name) => name.trim()).filter((name) => name !== ""))];
  const enabled = await listEnabledSkills();
  const found = enabled.filter((skill) => wanted.includes(skill.name));
  const missing = wanted.filter((name) => !found.some((skill) => skill.name === name));
  return { found, missing };
}
