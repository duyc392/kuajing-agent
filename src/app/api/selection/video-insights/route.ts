// 用途：视频深度透视接口（SPEC 6.3）：按候选品 ID 返回 4 节点关键帧 + 原声台词与 8 维客观事实（当前阶段确定性模拟数据）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { assertShopExists, getVideoInsight } from "@/services/selection.service";

const insightBody = z.object({
  shopId: z.string({ required_error: "缺少 shopId" }).trim().min(1, "缺少 shopId").max(128, "shopId 无效"),
  candidateId: z.string({ required_error: "缺少候选品 ID" }).trim().min(1, "缺少候选品 ID").max(200, "候选品 ID 过长"),
  videoUrl: z.string({ required_error: "缺少视频地址" }).url("视频地址格式不正确").max(2048, "视频地址过长"),
});

export async function POST(request: Request) {
  try {
    const body = insightBody.parse(await readJsonBody(request));
    await assertShopExists(body.shopId);
    return Response.json(getVideoInsight(body.candidateId, body.videoUrl));
  } catch (error) {
    return toErrorResponse(error);
  }
}
