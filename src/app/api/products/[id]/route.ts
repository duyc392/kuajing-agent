// 用途：单个商品接口：按 id + shopId 查询、更新、删除（shopId 必传，跨店铺访问返回 404，保证隔离）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { MAX_PRICE } from "@/lib/numbers";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { deleteProduct, getProduct, updateProduct } from "@/services/products.service";

const updateSchema = z.object({
  name: z.string().min(1, "商品名称不能为空").max(200, "商品名称过长（上限 200 字）").optional(),
  category: z.string().max(100, "类目名过长（上限 100 字）").nullable().optional(),
  price: z.number().finite("价格必须是有限数字").nonnegative("价格不能为负数").max(MAX_PRICE, "价格不能超过 1000 万").nullable().optional(),
  description: z.string().max(5000, "商品描述过长（上限 5000 字）").nullable().optional(),
  skuRule: z.string().max(500, "SKU 规则过长（上限 500 字）").nullable().optional(),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await getProduct({ id: params.id, shopId: readShopId(request) }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateProduct({ id: params.id, shopId: readShopId(request) }, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await deleteProduct({ id: params.id, shopId: readShopId(request) }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
