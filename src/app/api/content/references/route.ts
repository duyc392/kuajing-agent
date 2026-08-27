// 用途：内容运营-爆款拆解接口：GET 读取指定商品的爆款内容逆向拆解列表（先校验店铺与商品归属，再读数据源）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { collectContentReferences } from "@/services/content-ops.service";

const querySchema = z.object({
  productId: z.string({ required_error: "缺少商品 ID" }).trim().min(1, "缺少商品 ID").max(128, "商品 ID 格式无效"),
});

export async function GET(request: Request) {
  try {
    const { productId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await collectContentReferences(readShopId(request), productId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
