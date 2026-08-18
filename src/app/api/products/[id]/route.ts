// 用途：单个商品接口：按 id + shopId 查询、更新、删除（shopId 必传，跨店铺访问返回 404，保证隔离）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { ValidationError } from "@/lib/errors";
import { deleteProduct, getProduct, updateProduct } from "@/services/products.service";

const updateSchema = z.object({
  name: z.string().min(1, "商品名称不能为空").optional(),
  category: z.string().nullable().optional(),
  price: z.number().nonnegative("价格不能为负数").nullable().optional(),
  description: z.string().nullable().optional(),
  skuRule: z.string().nullable().optional(),
});

function buildQuery(request: Request, id: string) {
  const shopId = new URL(request.url).searchParams.get("shopId");
  if (!shopId) throw new ValidationError("缺少 shopId 参数：商品操作必须限定店铺");
  return { id, shopId };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await getProduct(buildQuery(request, params.id)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await request.json());
    return Response.json(await updateProduct(buildQuery(request, params.id), input));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await deleteProduct(buildQuery(request, params.id)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
