// 用途：素材需求-镜头接口：GET 读取指定商品的镜头执行明细；POST 显式同步当前脚本分镜。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { listShotRequirements, syncShotRequirementsForProduct } from "@/services/shot-requirements.service";

const querySchema = z.object({
  productId: z.string({ required_error: "缺少商品 ID" }).trim().min(1, "缺少商品 ID").max(128, "商品 ID 格式无效"),
});

export async function GET(request: Request) {
  try {
    const { productId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listShotRequirements(readShopId(request), productId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { productId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await syncShotRequirementsForProduct(readShopId(request), productId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
