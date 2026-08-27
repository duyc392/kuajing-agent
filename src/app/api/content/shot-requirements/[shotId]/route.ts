// 用途：素材需求-镜头状态接口：PATCH 切换单个镜头的执行状态（zod 校验 + readJsonBody 统一读体 + shopId 隔离）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { SHOT_REQUIREMENT_STATUSES } from "@/config/content";
import { updateShotRequirementStatus } from "@/services/shot-requirements.service";

const paramsSchema = z.object({
  shotId: z.string({ required_error: "缺少镜头 ID" }).trim().min(1, "缺少镜头 ID").max(128, "镜头 ID 格式无效"),
});

const statusSchema = z.object({
  status: z.enum(SHOT_REQUIREMENT_STATUSES),
});

export async function PATCH(request: Request, { params }: { params: { shotId: string } }) {
  try {
    const { shotId } = paramsSchema.parse({ shotId: params.shotId });
    const input = statusSchema.parse(await readJsonBody(request));
    const row = await updateShotRequirementStatus(readShopId(request), shotId, input.status);
    return Response.json(row);
  } catch (error) {
    return toErrorResponse(error);
  }
}
