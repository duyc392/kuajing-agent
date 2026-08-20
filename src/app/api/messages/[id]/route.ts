// 用途：单个消息接口：PATCH 更新消息中某个工具调用的技能提议状态（确认/忽略结果持久化，PRD 故事 46）；
// 消息按 shopId 归属校验，跨店铺更新返回 404；proposalState 仅允许 confirmed / ignored（pending 为缺省态）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { updateMessageToolCall } from "@/services/messages.service";

const updateSchema = z
  .object({
    shopId: z.string().min(1, "缺少 shopId").max(128, "shopId 无效"),
    toolCallId: z.string().min(1, "缺少 toolCallId").max(128, "toolCallId 无效"),
    proposalState: z.enum(["confirmed", "ignored"]),
    skillId: z.string().min(1).max(128).optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateMessageToolCall({ messageId: params.id, ...input }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
