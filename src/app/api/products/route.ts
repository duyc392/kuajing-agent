// 用途：商品列表与创建接口：GET 必须带 shopId（店铺隔离铁律：不允许全库商品查询），POST 在指定店铺下创建商品。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { ValidationError } from "@/lib/errors";
import { createProduct, listProducts } from "@/services/products.service";

const createSchema = z.object({
  name: z.string({ required_error: "商品名称不能为空" }).min(1, "商品名称不能为空"),
  category: z.string().nullable().optional(),
  price: z.number({ required_error: "价格必须是数字" }).nonnegative("价格不能为负数").nullable().optional(),
  description: z.string().nullable().optional(),
  skuRule: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const shopId = new URL(request.url).searchParams.get("shopId");
    if (!shopId) throw new ValidationError("缺少 shopId 参数：商品列表必须按店铺查询");
    return Response.json(await listProducts(shopId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const shopId = new URL(request.url).searchParams.get("shopId");
    if (!shopId) throw new ValidationError("缺少 shopId 参数：必须在指定店铺下创建商品");
    const input = createSchema.parse(await request.json());
    return Response.json(await createProduct(shopId, input), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
