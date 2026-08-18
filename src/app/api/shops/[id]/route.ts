// 用途：单个店铺接口：按 id 查询、编辑、归档（归档代替删除，对应 PRD 店铺管理用户故事）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { archiveShop, getShop, updateShop } from "@/services/shops.service";

const updateSchema = z.object({
  name: z.string().min(1, "店铺名称不能为空").optional(),
  market: z.string().min(1, "目标市场不能为空").optional(),
  description: z.string().nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await getShop(params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await request.json());
    return Response.json(await updateShop(params.id, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await archiveShop(params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
