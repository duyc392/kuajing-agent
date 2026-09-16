// 用途：技能列表与创建接口：GET 列出全部技能（技能不属于特定店铺，无需 shopId），
// POST 创建技能（对话确认卡片调用；同名同内容幂等返回既有条目，同名不同内容返回 409 冲突）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX, SKILL_PROMPT_MAX } from "@/config/skills";
import { createSkill, listSkills } from "@/services/skills.service";

const createSchema = z
  .object({
    name: z.string().trim().min(1, "技能名称不能为空").max(SKILL_NAME_MAX, `技能名称过长（上限 ${SKILL_NAME_MAX} 字）`),
    description: z.string().trim().max(SKILL_DESCRIPTION_MAX, `技能说明过长（上限 ${SKILL_DESCRIPTION_MAX} 字）`).default(""),
    prompt: z.string().trim().min(1, "技能复用指令不能为空").max(SKILL_PROMPT_MAX, `技能复用指令过长（上限 ${SKILL_PROMPT_MAX} 字）`),
    alwaysApply: z.boolean({ invalid_type_error: "常驻开关必须为布尔值" }).default(true),
  })
  .strict();

export async function GET() {
  try {
    return Response.json(await listSkills());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await readJsonBody(request));
    return Response.json(await createSkill(input));
  } catch (error) {
    return toErrorResponse(error);
  }
}
