// 用途：商品变体接口：GET 按店铺列出商品的全部变体；POST 在商品下新建变体（先校验商品归属，跨店铺 404）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { MAX_INT32, MAX_PRICE } from "@/lib/numbers";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { createVariant, listVariants } from "@/services/variants.service";

const variantSchema = z.object({
  sku: z.string({ required_error: "SKU 不能为空" }).trim().min(1, "SKU 不能为空").max(100, "SKU 过长（上限 100 字）"),
  color: z.string().max(50, "颜色过长（上限 50 字）").nullable().optional(),
  size: z.string().max(50, "尺寸过长（上限 50 字）").nullable().optional(),
  price: z.number().finite("价格必须是有限数字").nonnegative("价格不能为负数").max(MAX_PRICE, "价格不能超过 1000 万").nullable().optional(),
  stock: z.number().int("库存必须是整数").nonnegative("库存不能为负数").max(MAX_INT32, "库存超出系统上限").nullable().optional(),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await listVariants(params.id, readShopId(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = variantSchema.parse(await readJsonBody(request));
    return Response.json(await createVariant(params.id, readShopId(request), input), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
