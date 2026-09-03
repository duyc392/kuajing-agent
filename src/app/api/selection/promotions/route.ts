// 用途：推进测品接口（SPEC 6.5）：校验入参后交给 Agent 层编排（无定制脚本先真实生成 1 条草稿），
// 再经服务层重新算账、去重与事务落库 Product(testingStatus="testing") + ProductDna + 3 篇 VideoScript + ShotRequirement。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { promoteSelection } from "@/agent/selection-workbench-flow";
import { customDraftScriptSchema, selectionCandidateSchema } from "@/lib/selection-schemas";

const promotionBody = z.object({
  shopId: z.string({ required_error: "缺少 shopId" }).trim().min(1, "缺少 shopId").max(128, "shopId 无效"),
  candidate: selectionCandidateSchema,
  customDraftScript: customDraftScriptSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const body = promotionBody.parse(await readJsonBody(request));
    const result = await promoteSelection({
      shopId: body.shopId,
      candidate: body.candidate,
      customDraftScript: body.customDraftScript,
      signal: request.signal,
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
