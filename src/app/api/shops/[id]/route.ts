// 用途：单个店铺接口：按 id 查询、编辑、归档（归档代替删除，对应 PRD 店铺管理用户故事）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { isKnownMarket } from "@/lib/markets";
import { archiveShop, getShop, updateShop } from "@/services/shops.service";

const MARKET_ERROR = "目标市场不在支持列表中，请从下拉列表选择";

const updateSchema = z.object({
  name: z.string().trim().min(1, "店铺名称不能为空").max(100, "店铺名称过长（上限 100 字）").optional(),
  market: z.string().trim().refine(isKnownMarket, MARKET_ERROR).optional(),
  description: z.string().max(2000, "店铺简述过长（上限 2000 字）").nullable().optional(),
  archived: z.boolean().optional(),
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
    const input = updateSchema.parse(await readJsonBody(request));
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
