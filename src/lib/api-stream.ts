// 用途：前端统一流式请求封装：组件经它调用返回 SSE 的 /api/* 接口，解析 data: 事件行并回调，禁止在组件里裸写 fetch。
import type { ChatStreamEvent } from "@/types";

// 客户端空闲超时：一轮回复含慢工具（生图 60-90 秒），取与服务端主回合硬超时一致的 180 秒；
// 计时只重置于"收到任意字节"，连接层卡死时由这里兜底报错，而不是永远挂起。
const IDLE_TIMEOUT_MS = 180_000;

interface SseParseResult {
  events: ChatStreamEvent[];
  rest: string;
}

// 解析一段 SSE 字节：切出完整事件并返回剩余半截缓冲；data 行 JSON 损坏抛中文错误（静默丢弃会丢失终止事件）。
function parseSseChunk(buffer: string, chunk: string): SseParseResult {
  const parts = (buffer + chunk).split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ChatStreamEvent[] = [];
  for (const part of parts) {
    if (!part.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(part.slice(6)) as ChatStreamEvent);
    } catch {
      throw new Error("对话流数据格式异常，请重试");
    }
  }
  return { events, rest };
}

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
  let terminated = false; // 是否已收到业务终止事件（done / error）
  let timedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => undefined);
    }, IDLE_TIMEOUT_MS);
  };
  try {
    resetIdleTimer();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();
      const { events, rest } = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const event of events) {
        if (event.type === "done" || event.type === "error") terminated = true;
        onEvent(event);
      }
    }
    if (timedOut) throw new Error("AI 服务长时间无响应，请稍后重试");
    // 流结束但未收到终止事件：连接被中途掐断，按中断报错（恢复走历史加载，不自动重发，避免重复计费）。
    if (!terminated) throw new Error("回复中断，请稍后重试；已生成的内容会保存在对话记录里");
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    void reader.cancel().catch(() => undefined);
  }
}
