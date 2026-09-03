// 用途：临时脚本接口（SPEC 6.4）：基于候选品与视频透视数据调用 Agent 层编排生成内存草稿（persist:false），
// 时长严格等于参考视频时长；脚本不落库，仅供沙盒预览与推进测品时带回。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { generateDraftScript } from "@/agent/selection-workbench-flow";
import { assertShopExists } from "@/services/selection.service";
import { selectionCandidateSchema, videoInsightResultSchema } from "@/lib/selection-schemas";

const draftBody = z.object({
  shopId: z.string({ required_error: "缺少 shopId" }).trim().min(1, "缺少 shopId").max(128, "shopId 无效"),
  candidate: selectionCandidateSchema,
  videoInsight: videoInsightResultSchema,
});

export async function POST(request: Request) {
  try {
    const body = draftBody.parse(await readJsonBody(request));
    await assertShopExists(body.shopId);
    const result = await generateDraftScript({
      shopId: body.shopId,
      candidate: body.candidate,
      insight: body.videoInsight,
      signal: request.signal,
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
