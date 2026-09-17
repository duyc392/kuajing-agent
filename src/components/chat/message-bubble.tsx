// 用途：单条消息气泡：用户消息靠右蓝底，Agent 消息靠左白底；Agent 消息上方渲染历史工具调用卡片；流式输出期间显示光标动画。
"use client";

import ToolCard from "@/components/chat/tool-card";
import type { MessageView } from "@/types";

interface MessageBubbleProps {
  message: MessageView;
  streaming?: boolean;
}

export default function MessageBubble({ message, streaming = false }: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? "bg-[var(--workspace-primary)] text-white" : "border border-[var(--workspace-border)] bg-white text-gray-800"
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 grid gap-2">
            {message.toolCalls.map((call) => (
              <ToolCard key={call.id} call={call} messageId={message.id} />
            ))}
          </div>
        )}
        {message.content}
        {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
      </div>
    </div>
  );
}
