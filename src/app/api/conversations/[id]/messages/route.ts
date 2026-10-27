// 用途：仅发送消息（POST）；历史读取在上一级轻量路由，不加载 Agent。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { prepareUserTurn, runAgentReplyEvents, type AgentReplyParams } from "@/agent/chat";
import type { ChatStreamEvent } from "@/types";

const idSchema = z.string().min(1, "缺少对话 ID").max(128, "对话 ID 无效");
const sendSchema = z.object({
  shopId: z.string().min(1, "缺少 shopId").max(128, "shopId 无效"),
  content: z.string().trim().min(1, "消息内容不能为空").max(20000, "消息内容过长（上限 2 万字符）"),
});

function createReplyStream(params: AgentReplyParams): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { closed = true; }
      };
      try {
        send({ type: "user", message: params.userMessage });
        for await (const event of runAgentReplyEvents(params)) send(event);
      } finally {
        // 锁由后端回合 finally 释放；不能在浏览器断开时提前释放仍在执行的回合。
        try { controller.close(); } catch { /* 流已取消。 */ }
      }
    },
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = sendSchema.parse(await readJsonBody(request));
    const conversationId = idSchema.parse(params.id);
    const userMessage = await prepareUserTurn({ conversationId, ...input });
    const stream = createReplyStream({ conversationId, ...input, userMessage, signal: request.signal });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store",
    } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
