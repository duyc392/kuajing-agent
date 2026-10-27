// 用途：聊天展示与交互；生命周期分别由历史加载和发送 hook 管理。
"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChatInput } from "./chat-input";
export { ChatInput } from "./chat-input";
import { useConversationMessages } from "./use-conversation-messages";
import { useChatSend } from "./use-chat-send";
import MessageBubble from "./message-bubble";
import ToolCard from "./tool-card";
import QuickCommands from "./quick-commands";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { useShops } from "@/components/shop/shop-context";
import { SCRIPT_TOOL_NAME } from "@/types";
import type { ConversationInitialization, MessageView, ScriptToolDetails, ToolCallRecord } from "@/types";

interface ChatPanelProps extends ConversationInitialization {
  conversationId: string;
  onTurnComplete?: () => void;
  onUserMessageConfirmed?: () => void;
  onScriptResult?: (scriptId: string | null) => void;
}
interface MessageListProps {
  messages: MessageView[];
  activeTools: ToolCallRecord[];
  streamText: string;
  bottomRef: React.Ref<HTMLDivElement>;
}
function MessageList({ messages, activeTools, streamText, bottomRef }: MessageListProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-6">
      {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      {activeTools.map((call) => <div key={call.id} className="flex justify-start"><ToolCard call={call} /></div>)}
      {streamText !== "" && <MessageBubble message={{ id: "streaming", role: "agent", content: streamText, createdAt: new Date().toISOString() }} streaming />}
      <div ref={bottomRef} />
    </div>
  );
}

function useScriptResult(messages: MessageView[] | null, onScriptResult: ChatPanelProps["onScriptResult"]) {
  useEffect(() => {
    if (!onScriptResult) return;
    const calls = (messages ?? []).flatMap((message) => message.toolCalls ?? []);
    const call = calls.reverse().find((item) => item.toolName === SCRIPT_TOOL_NAME && item.status === "done");
    onScriptResult((call?.details as ScriptToolDetails | undefined)?.scriptId ?? null);
  }, [messages, onScriptResult]);
}

function ConversationPanel(props: ChatPanelProps & { shopId: string | null }) {
  const pathname = usePathname();
  const history = useConversationMessages(props.conversationId, props.shopId, props.initialMessages);
  const chat = useChatSend({ ...props, pathname, messages: history.messages, setMessages: history.setMessages });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const disabled = chat.sending || history.messages === null || chat.needsHistory || !props.shopId;
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [history.messages?.length, chat.streamText, chat.activeTools.length]);
  useScriptResult(history.messages, props.onScriptResult);
  const retry = () => { chat.markHistoryReload(); history.retry(); };
  const submit = () => { if (!disabled) void chat.send(chat.input); };
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {history.messages === null && !history.error && <Loading text="加载消息记录…" />}
        {history.error && <div className="p-4"><ErrorMessage message={history.error} onRetry={retry} /></div>}
        {history.messages !== null && <MessageList messages={history.messages} activeTools={chat.activeTools} streamText={chat.streamText} bottomRef={bottomRef} />}
        {chat.error && <div className="px-4 pb-3"><ErrorMessage message={chat.error} />
          <button type="button" disabled={chat.sending || history.messages === null} onClick={retry} className="mt-2 text-sm text-[#246750] underline disabled:opacity-50">重新加载历史，确认送达状态</button>
        </div>}
      </div>
      <QuickCommands disabled={disabled} onSend={(content) => { if (!disabled) void chat.send(content); }} />
      <ChatInput value={chat.input} onChange={chat.setInput} disabled={disabled} onSubmit={submit} />
    </div>
  );
}

export default function ChatPanel(props: ChatPanelProps) {
  const { currentShopId } = useShops();
  return <ConversationPanel key={`${currentShopId}:${props.conversationId}`} {...props} shopId={currentShopId} />;
}
