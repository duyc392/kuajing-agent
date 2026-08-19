// 用途：单个记忆条目接口：PATCH 编辑分类/内容（至少提交一个字段），DELETE 删除；未知字段严格拒绝
// （记忆分类口径与提取器一致，从 config/memory 构建，避免重复硬编码）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { MEMORY_CATEGORIES } from "@/config/memory";
import { deleteMemory, updateMemory } from "@/services/memory.service";

const updateSchema = z
  .object({
    category: z.enum(MEMORY_CATEGORIES).optional(),
    content: z.string().trim().min(1, "记忆内容不能为空").max(500, "记忆内容过长（上限 500 字）").optional(),
  })
  .strict()
  .refine((input) => input.category !== undefined || input.content !== undefined, {
    message: "至少提交一个修改字段（category 或 content）",
  });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateMemory({ id: params.id, shopId: readShopId(request) }, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteMemory({ id: params.id, shopId: readShopId(request) });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
