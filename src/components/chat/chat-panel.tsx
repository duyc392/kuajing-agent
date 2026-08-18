// 用途：对话面板：加载所选对话的历史消息、底部输入框发送消息、流式接收 Agent 回复（打字机效果），完成后通知外层刷新对话列表。
"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest } from "@/lib/api-client";
import { streamChatRequest } from "@/lib/api-stream";
import MessageBubble from "@/components/chat/message-bubble";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { useShops } from "@/components/shop/shop-context";
import type { ChatStreamEvent, MessageView } from "@/types";

interface MessageListProps {
  messages: MessageView[];
  streamText: string;
  bottomRef: React.Ref<HTMLDivElement>;
}

function MessageList({ messages, streamText, bottomRef }: MessageListProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {streamText !== "" && (
        <MessageBubble
          message={{ id: "streaming", role: "agent", content: streamText, createdAt: new Date().toISOString() }}
          streaming
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}

interface ChatInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  onSubmit: () => void;
}

function ChatInput({ value, onChange, disabled, onSubmit }: ChatInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl items-end gap-3">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={2}
          maxLength={20000}
          placeholder="输入消息，Enter 发送（Shift + Enter 换行）"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={disabled || value.trim() === ""}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {disabled ? "回复中…" : "发送"}
        </button>
      </form>
    </div>
  );
}

interface ChatPanelProps {
  conversationId: string;
  onTurnComplete?: () => void;
}

// 新内容出现时把消息区滚到底部。
function useAutoScroll(bottomRef: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// 历史消息加载：切换对话或店铺时重新拉取，过期请求作废；retry 使重载计数器变化以重新触发副作用。
function useConversationMessages(conversationId: string, currentShopId: string | null) {
  const [messages, setMessages] = useState<MessageView[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setMessages(null);
    setError("");
    apiRequest<unknown>("GET", `/api/conversations/${conversationId}/messages?shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("消息记录数据异常");
        setMessages(rows as MessageView[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "消息记录加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [conversationId, currentShopId, reloadCount]);

  const retry = () => setReloadCount((count) => count + 1);
  return { messages, setMessages, error, setError, retry };
}

interface StreamHandlerSetters {
  setMessages: (updater: (prev: MessageView[] | null) => MessageView[]) => void;
  setStreamText: (updater: (prev: string) => string) => void;
  setError: (message: string) => void;
}

// SSE 流事件分派：把后端事件落到本地状态。
function createStreamEventHandler(setters: StreamHandlerSetters) {
  return (event: ChatStreamEvent) => {
    if (event.type === "user") setters.setMessages((prev) => [...(prev ?? []), event.message]);
    if (event.type === "delta") setters.setStreamText((prev) => prev + event.text);
    if (event.type === "done") {
      setters.setMessages((prev) => [...(prev ?? []), event.agentMessage]);
      setters.setStreamText(() => "");
    }
    if (event.type === "error") setters.setError(event.error);
  };
}

export default function ChatPanel({ conversationId, onTurnComplete }: ChatPanelProps) {
  const { currentShopId } = useShops();
  const { messages, setMessages, error, setError, retry } = useConversationMessages(conversationId, currentShopId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [streamText, setStreamText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const handleEvent = createStreamEventHandler({ setMessages, setStreamText, setError });

  useAutoScroll(bottomRef, [messages?.length, streamText]);

  async function handleSend() {
    // sendingRef 同步锁：同一瞬间连点两次发送都会读到 sending=false 而发出两条消息，用 ref 立即占位。
    if (sendingRef.current) return;
    const content = input.trim();
    if (content === "" || !currentShopId) return;
    sendingRef.current = true;
    setSending(true);
    setInput("");
    setError("");
    setStreamText("");
    try {
      await streamChatRequest(
        `/api/conversations/${conversationId}/messages`,
        { shopId: currentShopId, content },
        handleEvent,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败，请重试");
    } finally {
      sendingRef.current = false;
      setSending(false);
      onTurnComplete?.();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {messages === null && !error && <Loading text="加载消息记录…" />}
        {error && messages === null && <div className="p-4"><ErrorMessage message={error} onRetry={retry} /></div>}
        {messages !== null && <MessageList messages={messages} streamText={streamText} bottomRef={bottomRef} />}
        {error && messages !== null && <div className="px-4 pb-3"><ErrorMessage message={error} /></div>}
      </div>
      <ChatInput value={input} onChange={setInput} disabled={sending} onSubmit={handleSend} />
    </div>
  );
}
