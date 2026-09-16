// 用途：单个技能接口：PATCH 更新启用状态或常驻开关（至少传其一），DELETE 删除；id 为 Prisma 记录 id，由服务层校验归属（不存在返回 404）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { deleteSkill, updateSkill } from "@/services/skills.service";

const updateSchema = z
  .object({
    enabled: z.boolean().optional(),
    alwaysApply: z.boolean({ invalid_type_error: "常驻开关必须为布尔值" }).optional(),
  })
  .strict()
  .refine((input) => input.enabled !== undefined || input.alwaysApply !== undefined, {
    message: "至少提供 enabled 或 alwaysApply 之一",
  });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateSkill(params.id, input));
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
