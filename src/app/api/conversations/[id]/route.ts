// 用途：轻量读取对话历史、删除对话；仅依赖服务层，不加载 Agent；shopId 走查询参数。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { ValidationError } from "@/lib/errors";
import { deleteConversation } from "@/services/conversations.service";
import { listMessages } from "@/services/messages.service";

const idSchema = z.string().min(1, "缺少对话 ID").max(128, "对话 ID 无效");

function readScope(request: Request, id: string): { conversationId: string; shopId: string } {
  const conversationId = idSchema.parse(id);
  const shopId = new URL(request.url).searchParams.get("shopId") ?? "";
  if (shopId === "") throw new ValidationError("缺少 shopId");
  if (shopId.length > 128) throw new ValidationError("shopId 无效");
  return { conversationId, shopId };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { conversationId, shopId } = readScope(request, params.id);
    return Response.json(await listMessages(conversationId, shopId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { conversationId, shopId } = readScope(request, params.id);
    await deleteConversation({ id: conversationId, shopId });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
