// 用途：Agent 对话接口，接收用户消息并以流式（SSE）返回 Agent 回复与工具调用过程。
export function POST() {
  return Response.json({ ok: true });
}
