// 用途：聊天 POST SSE；连接与流中空闲独立计时，取消/超时绝不自动重发。
import { CHAT_STREAM_TIMEOUTS } from "@/config/chat";
import type { ChatStreamEvent } from "@/types";

interface StreamTimeouts { connectionMs: number; idleMs: number }

export class ChatStreamError extends Error {
  constructor(message: string, public delivery: "rejected" | "uncertain" = "uncertain") {
    super(message);
    this.name = "ChatStreamError";
  }
}

function parseSseChunk(buffer: string, chunk: string): { events: ChatStreamEvent[]; rest: string } {
  const parts = (buffer + chunk).replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ChatStreamEvent[] = [];
  for (const part of parts) {
    if (!part.startsWith("data: ")) continue;
    try { events.push(JSON.parse(part.slice(6)) as ChatStreamEvent); }
    catch { throw new ChatStreamError("对话流数据格式异常，请重新加载历史确认送达状态"); }
  }
  return { events, rest };
}

function createStreamControl(signal: AbortSignal | undefined, timeouts: StreamTimeouts) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectWait: (error: Error) => void = () => undefined;
  const failure = new Promise<never>((_resolve, reject) => { rejectWait = reject; });
  const stop = (error: Error) => { rejectWait(error); controller.abort(); };
  const onAbort = () => stop(new DOMException("请求已取消", "AbortError"));
  const arm = (ms: number, message: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => stop(new ChatStreamError(message)), ms);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  arm(timeouts.connectionMs, "聊天连接等待超时，请重新加载历史确认送达状态");
  if (signal?.aborted) onAbort();
  return {
    signal: controller.signal,
    wait: <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, failure]),
    idle: () => arm(timeouts.idleMs, "AI 服务长时间无响应，请重新加载历史"),
    dispose: () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); controller.abort(); },
  };
}

type StreamControl = ReturnType<typeof createStreamControl>;

async function consumeStream(response: Response, control: StreamControl, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  if (!response.body) throw new ChatStreamError("对话流为空，请重新加载历史");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await control.wait(reader.read());
      if (done) throw new ChatStreamError("回复中断，请重新加载历史；不要直接重复发送");
      control.idle();
      const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (control.signal.aborted) throw new DOMException("请求已取消", "AbortError");
        onEvent(event);
        if (event.type === "error") throw new ChatStreamError(event.error);
        if (event.type === "done") return;
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

async function checkResponse(response: Response, control: StreamControl): Promise<void> {
  if (response.ok) return;
  const data: unknown = await control.wait(response.json().catch(() => null));
  const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error : "请求失败，请稍后重试";
  throw new ChatStreamError(message, response.status >= 400 && response.status < 500 ? "rejected" : "uncertain");
}

export async function streamChatRequest(
  path: string, body: unknown, onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal, timeouts: StreamTimeouts = CHAT_STREAM_TIMEOUTS,
): Promise<void> {
  if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
  const control = createStreamControl(signal, timeouts);
  try {
    const response = await control.wait(fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: control.signal,
    }));
    await checkResponse(response, control);
    control.idle();
    await consumeStream(response, control, onEvent);
  } finally {
    control.dispose();
  }
}
