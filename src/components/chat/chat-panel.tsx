// 用途：对话面板：加载所选对话的历史消息、底部输入框发送消息、流式接收 Agent 回复（打字机效果），完成后通知外层刷新对话列表。
"use client";

import { useEffect, useRef, useState } from "react";
import { ChatInput } from "@/components/chat/chat-input";
export { ChatInput } from "@/components/chat/chat-input";
import { usePathname } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { streamChatRequest } from "@/lib/api-stream";
import MessageBubble from "@/components/chat/message-bubble";
import ToolCard from "@/components/chat/tool-card";
import QuickCommands from "@/components/chat/quick-commands";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { useShops } from "@/components/shop/shop-context";
import { readSelectionSummary } from "@/components/selection/selection-context";
import { readProductSnapshot } from "@/components/chat/product-snapshot";
import type { ChatStreamEvent, MessageView, ScriptToolDetails, ToolCallRecord } from "@/types";
import { SCRIPT_TOOL_NAME } from "@/types";

interface MessageListProps {
  messages: MessageView[];
  activeTools: ToolCallRecord[];
  streamText: string;
  bottomRef: React.Ref<HTMLDivElement>;
}

function MessageList({ messages, activeTools, streamText, bottomRef }: MessageListProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {activeTools.map((call) => (
        <div key={call.id} className="flex justify-start">
          <ToolCard call={call} />
        </div>
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

interface ChatPanelProps {
  conversationId: string;
  onTurnComplete?: () => void;
  /** 抽屉懒创建场景：首条消息在历史加载完成后自动发送一次（正常对话不传）。 */
  autoSendMessage?: string;
  /** 最新视频脚本结果上抛（供工作台右侧只读预览）：取最近一条成功脚本工具调用的 scriptId，无则为 null。 */
  onScriptResult?: (scriptId: string | null) => void;
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
  setActiveTools: (updater: (prev: ToolCallRecord[]) => ToolCallRecord[]) => void;
  failStream: (message: string) => void;
}

// SSE 流事件分派：把后端事件落到本地状态；工具开始/结束维护进行中的工具卡片列表；
// error 与 done 一样清空流式残留与工具状态卡（经 failStream），避免"分析中……"卡片停留。
function createStreamEventHandler(setters: StreamHandlerSetters) {
  return (event: ChatStreamEvent) => {
    if (event.type === "user") setters.setMessages((prev) => [...(prev ?? []), event.message]);
    if (event.type === "tool_start") setters.setActiveTools((prev) => [...prev, event.call]);
    if (event.type === "tool_end") {
      setters.setActiveTools((prev) => prev.map((call) => (call.id === event.call.id ? event.call : call)));
    }
    if (event.type === "delta") setters.setStreamText((prev) => prev + event.text);
    if (event.type === "done") {
      setters.setMessages((prev) => [...(prev ?? []), event.agentMessage]);
      setters.setStreamText(() => "");
      setters.setActiveTools(() => []);
    }
    if (event.type === "error") setters.failStream(event.error);
  };
}

interface UseChatSendArgs {
  conversationId: string;
  shopId: string | null;
  pathname: string;
  messages: MessageView[] | null;
  setMessages: React.Dispatch<React.SetStateAction<MessageView[] | null>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  autoSendMessage?: string;
  onTurnComplete?: () => void;
}

// 返回随组件卸载才触发的取消信号：抽屉关闭不卸载组件，故进行中的流式回复不会被中断。
function useAbortSignal(): AbortSignal | undefined {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => {
    ref.current = new AbortController();
    return () => ref.current?.abort();
  }, []);
  return ref.current?.signal;
}

// 懒创建场景：等历史消息加载完成后再自动发送首条消息，避免与消息加载互相覆盖；每个组件实例只发一次。
function useAutoSend(autoSendMessage: string | undefined, messages: MessageView[] | null, send: (content: string) => void) {
  const sentRef = useRef(false);
  useEffect(() => {
    if (!autoSendMessage || messages === null || sentRef.current) return;
    sentRef.current = true;
    send(autoSendMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendMessage, messages]);
}

// 页面数据快照拼装：选品候选摘要（沙盒存在时）+ 商品页实时快照（商品详情页打开时），
// 均为数据区标记、声明"与前文冲突时以此为准"；快照读取失败静默跳过，不阻断发送。
async function buildEffectiveContent(content: string, pathname: string, shopId: string): Promise<string> {
  const blocks: string[] = [];
  const summary = readSelectionSummary(shopId);
  if (summary !== null) {
    blocks.push(`[selection-summary]\n以下为当前选品候选池的最新摘要，与前文冲突时以此为准：\n${summary}\n[/selection-summary]`);
  }
  const productSnapshot = await readProductSnapshot(pathname, shopId);
  if (productSnapshot !== null) blocks.push(productSnapshot);
  return blocks.length === 0 ? content : `${content}\n\n${blocks.join("\n\n")}`;
}

// 发送与流式回复：维护发送锁、流式文本与工具状态；组件卸载时取消请求；懒创建时自动发送首条消息。
function useChatSend(args: UseChatSendArgs) {
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [streamText, setStreamText] = useState("");
  const [activeTools, setActiveTools] = useState<ToolCallRecord[]>([]);

  // 失败收口：清空流式残留与进行中工具卡并提示；SSE 错误事件与请求异常统一走这里，避免"分析中……"卡片停留。
  const failStream = (message: string) => {
    setStreamText("");
    setActiveTools([]);
    args.setError(message);
  };

  const handleEvent = createStreamEventHandler({
    setMessages: args.setMessages,
    setStreamText,
    setActiveTools,
    failStream,
  });
  const abortSignal = useAbortSignal();

  // 返回是否送达：成功或主动中止为 true（无需恢复草稿），失败为 false 供调用方恢复输入。
  async function send(content: string): Promise<boolean> {
    // sendingRef 同步锁：同一瞬间连点两次发送都会读到 sending=false 而发出两条消息，用 ref 立即占位。
    if (sendingRef.current || !args.shopId) return true;
    sendingRef.current = true;
    setSending(true);
    args.setError("");
    setStreamText("");
    setActiveTools([]);
    try {
      const effectiveContent = await buildEffectiveContent(content, args.pathname, args.shopId);
      await streamChatRequest(
        `/api/conversations/${args.conversationId}/messages`,
        { shopId: args.shopId, content: effectiveContent },
        handleEvent,
        abortSignal,
      );
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return true;
      failStream(e instanceof Error ? e.message : "发送失败，请重试");
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
      args.onTurnComplete?.();
    }
  }

  useAutoSend(args.autoSendMessage, args.messages, send);

  return { sending, streamText, activeTools, send };
}

export default function ChatPanel({ conversationId, onTurnComplete, autoSendMessage, onScriptResult }: ChatPanelProps) {
  const { currentShopId } = useShops();
  const pathname = usePathname();
  const { messages, setMessages, error, setError, retry } = useConversationMessages(conversationId, currentShopId);
  const [input, setInput] = useState("");
  const { sending, streamText, activeTools, send } = useChatSend({
    conversationId,
    shopId: currentShopId,
    pathname,
    messages,
    setMessages,
    setError,
    autoSendMessage,
    onTurnComplete,
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useAutoScroll(bottomRef, [messages?.length, streamText, activeTools.length]);

  // 最新脚本结果上抛：从最新到最旧扫描消息与工具调用，取第一条成功的视频脚本 scriptId（历史加载与新回合完成都会触发）。
  useEffect(() => {
    if (!onScriptResult) return;
    let found: string | null = null;
    for (let i = (messages ?? []).length - 1; i >= 0 && found === null; i -= 1) {
      for (let j = (messages![i].toolCalls ?? []).length - 1; j >= 0; j -= 1) {
        const call = messages![i].toolCalls![j];
        if (call.toolName === SCRIPT_TOOL_NAME && call.status === "done") {
          found = (call.details as ScriptToolDetails | undefined)?.scriptId ?? null;
          break;
        }
      }
    }
    onScriptResult(found);
  }, [messages, onScriptResult]);

  async function handleSend() {
    if (sending) return;
    const content = input.trim();
    if (content === "" || !currentShopId) return;
    setInput("");
    const delivered = await send(content);
    // 发送失败且用户没有输入新内容时恢复草稿，长输入不因一次网络失败丢失。
    if (!delivered) setInput((prev) => (prev === "" ? content : prev));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {messages === null && !error && <Loading text="加载消息记录…" />}
        {error && messages === null && <div className="p-4"><ErrorMessage message={error} onRetry={retry} /></div>}
        {messages !== null && <MessageList messages={messages} activeTools={activeTools} streamText={streamText} bottomRef={bottomRef} />}
        {error && messages !== null && <div className="px-4 pb-3"><ErrorMessage message={error} /></div>}
      </div>
      <QuickCommands disabled={sending || messages === null} onSend={send} />
      <ChatInput value={input} onChange={setInput} disabled={sending} onSubmit={handleSend} />
    </div>
  );
}
