// 用途：单个视频脚本接口：GET 查询脚本详情（含分镜），PATCH 保存人工修改（类型/钩子/CTA/风格；总时长由分镜秒数决定、分镜内容经对话重新生成，均不接受单独修改）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { getScript, updateScript } from "@/services/video-scripts.service";

const EDITABLE_FIELDS = "type、hook、cta、style";

// 严格校验：未知字段（如 duration、shots）直接拒绝并指明可改字段，不静默丢弃（PRD 故事 25：分镜秒数总和必须等于总时长）。
const updateSchema = z
  .object({
    type: z.enum(["开箱", "教程", "种草", "对比"]).optional(),
    hook: z.string().trim().min(1, "钩子文案不能为空").max(200, "钩子文案过长（上限 200 字）").optional(),
    cta: z.string().trim().min(1, "行动号召不能为空").max(200, "行动号召过长（上限 200 字）").optional(),
    style: z.string().max(200, "风格描述过长（上限 200 字）").nullable().optional(),
  })
  .strict();

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await getScript({ id: params.id, shopId: readShopId(request) }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateScript({ id: params.id, shopId: readShopId(request) }, input));
  } catch (error) {
    if (error instanceof z.ZodError && error.issues.some((issue) => issue.code === "unrecognized_keys")) {
      const keys = error.issues
        .filter((issue) => issue.code === "unrecognized_keys")
        .flatMap((issue) => (Array.isArray(issue.keys) ? issue.keys : []))
        .join("、");
      return Response.json(
        { error: `不支持的修改字段：${keys}。可修改字段：${EDITABLE_FIELDS}；总时长与分镜由 Agent 生成，如需调整请在对话中重新生成脚本。`, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    return toErrorResponse(error);
  }
}
