// 用途：单个直播脚本接口：GET 查询详情（含流程阶段），PATCH 整段流程修改（总时长由阶段分钟数重算，不接受单独修改时长；未知字段严格拒绝）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { getLiveScript, updateLiveScript } from "@/services/live-scripts.service";

const segmentSchema = z.object({
  phase: z.string().trim().min(1, "阶段名称不能为空").max(50, "阶段名称过长（上限 50 字）"),
  minutes: z.number().int("阶段时长必须是整数分钟").min(1, "阶段时长至少 1 分钟").max(600, "阶段时长不能超过 600 分钟"),
  goal: z.string().trim().min(1, "阶段目标不能为空").max(200, "阶段目标过长（上限 200 字）"),
  script: z.string().trim().min(1, "阶段话术不能为空").max(2000, "阶段话术过长（上限 2000 字）"),
});

const updateSchema = z
  .object({
    segments: z.array(segmentSchema).min(1, "至少需要一个阶段").max(30, "阶段数量过多（上限 30 个）"),
  })
  .strict();

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await getLiveScript({ id: params.id, shopId: readShopId(request) }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateLiveScript({ id: params.id, shopId: readShopId(request) }, input));
  } catch (error) {
    if (error instanceof z.ZodError && error.issues.some((issue) => issue.code === "unrecognized_keys")) {
      const keys = error.issues
        .filter((issue) => issue.code === "unrecognized_keys")
        .flatMap((issue) => (Array.isArray(issue.keys) ? issue.keys : []))
        .join("、");
      return Response.json(
        { error: `不支持的修改字段：${keys}。可修改字段：segments（整段流程）；总时长由阶段分钟数自动重算，不可单独修改。`, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
