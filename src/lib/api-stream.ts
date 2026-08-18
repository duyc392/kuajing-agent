// 用途：前端统一流式请求封装：组件经它调用返回 SSE 的 /api/* 接口，解析 data: 事件行并回调，禁止在组件里裸写 fetch。
import type { ChatStreamEvent } from "@/types";

export async function streamChatRequest(
  path: string,
  body: unknown,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
        // 非完整 JSON 行（跨块截断的罕见场景）跳过，等待下一段补齐。
      }
    }
  }
}
