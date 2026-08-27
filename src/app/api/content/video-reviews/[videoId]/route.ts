// 用途：内容运营-视频复盘接口：GET 读取指定已发布视频的复盘（视频归属校验后读数据源；无复盘返回 { review: null } 属正常态）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { loadVideoReview } from "@/services/content-ops.service";

const paramsSchema = z.object({
  videoId: z.string({ required_error: "缺少视频 ID" }).trim().min(1, "缺少视频 ID").max(128, "视频 ID 格式无效"),
  productId: z.string({ required_error: "缺少商品 ID" }).trim().min(1, "缺少商品 ID").max(128, "商品 ID 格式无效"),
});

export async function GET(request: Request, { params }: { params: { videoId: string } }) {
  try {
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    const parsed = paramsSchema.parse({ videoId: params.videoId, productId });
    const review = await loadVideoReview(readShopId(request), parsed.productId, parsed.videoId);
    return Response.json({ review });
  } catch (error) {
    return toErrorResponse(error);
  }
}
