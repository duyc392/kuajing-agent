// 用途：单个技能接口：PATCH 启用/禁用，DELETE 删除；id 为 Prisma 记录 id，由服务层校验归属（不存在返回 404）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { deleteSkill, setSkillEnabled } from "@/services/skills.service";

const toggleSchema = z.object({ enabled: z.boolean() }).strict();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = toggleSchema.parse(await readJsonBody(request));
    return Response.json(await setSkillEnabled(params.id, input.enabled));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteSkill(params.id);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
