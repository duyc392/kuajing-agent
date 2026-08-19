// 用途：单个变体接口：PATCH 更新、DELETE 删除（都先校验商品归属店铺，跨店铺 / 不存在的变体返回 404）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { MAX_INT32, MAX_PRICE } from "@/lib/numbers";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { deleteVariant, updateVariant } from "@/services/variants.service";

const variantUpdateSchema = z.object({
  sku: z.string().trim().min(1, "SKU 不能为空").max(100, "SKU 过长（上限 100 字）").optional(),
  color: z.string().max(50, "颜色过长（上限 50 字）").nullable().optional(),
  size: z.string().max(50, "尺寸过长（上限 50 字）").nullable().optional(),
  price: z.number().finite("价格必须是有限数字").nonnegative("价格不能为负数").max(MAX_PRICE, "价格不能超过 1000 万").nullable().optional(),
  stock: z.number().int("库存必须是整数").nonnegative("库存不能为负数").max(MAX_INT32, "库存超出系统上限").nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string; variantId: string } }) {
  try {
    const input = variantUpdateSchema.parse(await readJsonBody(request));
    return Response.json(await updateVariant({ productId: params.id, variantId: params.variantId, shopId: readShopId(request) }, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string; variantId: string } }) {
  try {
    await deleteVariant({ productId: params.id, variantId: params.variantId, shopId: readShopId(request) });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
