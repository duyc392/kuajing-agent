// 用途：脚本列表接口：GET 按当前店铺查询视频脚本，可用 productId 限定到单商品（脚本创建经对话工具完成，本接口只读）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { listScripts } from "@/services/video-scripts.service";

const querySchema = z.object({
  productId: z.string().trim().min(1, "商品 ID 格式无效").max(128, "商品 ID 格式无效").optional(),
});

export async function GET(request: Request) {
  try {
    const { productId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listScripts(readShopId(request), productId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
