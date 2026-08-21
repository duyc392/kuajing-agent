// 用途：前端统一流式请求封装：组件经它调用返回 SSE 的 /api/* 接口，解析 data: 事件行并回调，禁止在组件里裸写 fetch。
import type { ChatStreamEvent } from "@/types";

export async function streamChatRequest(
  path: string,
  body: unknown,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const data: unknown = await response.json().catch(() => ({}));
    const message = (data as { error?: string }).error ?? "请求失败，请稍后重试";
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(part.slice(6)) as ChatStreamEvent);
      } catch {
        // 完整帧解析失败属于数据损坏：抛出友好错误由对话面板统一收口，不静默丢弃（否则会丢失 tool_end / done，状态卡停留）。
        throw new Error("对话流数据格式异常，请重试");
      }
    }
  }
}
