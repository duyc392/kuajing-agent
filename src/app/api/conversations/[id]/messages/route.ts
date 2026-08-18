// 用途：对话消息接口：GET 按店铺读取消息记录；POST 发送用户消息并以 SSE 流式返回 Agent 回复（user → delta… → done / error）。
// 业务编排在 Agent 层（prepareUserTurn / runAgentReply），本层只做参数校验与 SSE 帧封装。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { ValidationError } from "@/lib/errors";
import { listMessages } from "@/services/messages.service";
import { prepareUserTurn, runAgentReply } from "@/agent/chat";
import type { ChatStreamEvent, MessageView } from "@/types";

const idSchema = z.string({ required_error: "缺少对话 ID" }).min(1, "缺少对话 ID").max(128, "对话 ID 无效");
const sendSchema = z.object({
  shopId: z.string({ required_error: "缺少 shopId" }).min(1, "缺少 shopId").max(128, "shopId 无效"),
  content: z
    .string({ required_error: "消息内容不能为空" })
    .trim()
    .min(1, "消息内容不能为空")
    .max(20000, "消息内容过长（上限 2 万字符）"),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const conversationId = idSchema.parse(params.id);
    const shopId = new URL(request.url).searchParams.get("shopId") ?? "";
    if (shopId === "") throw new ValidationError("缺少 shopId");
    if (shopId.length > 128) throw new ValidationError("shopId 无效");
    return Response.json(await listMessages(conversationId, shopId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let conversationId = "";
  let shopId = "";
  let content = "";
  try {
    const input = sendSchema.parse(await request.json());
    conversationId = idSchema.parse(params.id);
    shopId = input.shopId;
    content = input.content;
  } catch (error) {
    return toErrorResponse(error);
  }

  // 用户消息先入库（校验失败在此以 JSON 返回 400/404，此时尚未开流）。
  let userMessageView: MessageView;
  try {
    userMessageView = await prepareUserTurn({ conversationId, shopId, content });
  } catch (error) {
    return toErrorResponse(error);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ type: "user", message: userMessageView });
      try {
        const agentMessage = await runAgentReply({
          conversationId,
          shopId,
          content,
          userMessage: userMessageView,
          onDelta: (text) => send({ type: "delta", text }),
        });
        send({ type: "done", agentMessage });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Agent 回复失败，请重试" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
