// 用途：聊天发送生命周期：StrictMode 安全首发、取消隔离、user 确认与不确定送达恢复。
"use client";
import { useEffect, useRef, useState } from "react";
import { ChatStreamError, streamChatRequest } from "@/lib/api-stream";
import { readSelectionSummary } from "@/components/selection/selection-context";
import { readProductSnapshot } from "./product-snapshot";
import { useChatLifetime, type ChatLifetime } from "./use-chat-lifetime";
import type { ChatSendOutcome, ChatStreamEvent, MessageView, ToolCallRecord } from "@/types";

interface SendArgs {
  conversationId: string;
  shopId: string | null;
  pathname: string;
  messages: MessageView[] | null;
  autoSendMessage?: string;
  setMessages: (update: (rows: MessageView[]) => MessageView[]) => void;
  onUserMessageConfirmed?: () => void;
  onTurnComplete?: () => void;
}
interface Attempt { content: string; effective: string; baseline: Set<string>; confirmed: boolean }
interface Runtime {
  buildContent: (content: string, pathname: string, shopId: string) => Promise<string>;
  stream: typeof streamChatRequest;
}

async function buildContent(content: string, pathname: string, shopId: string): Promise<string> {
  const blocks: string[] = [];
  const summary = readSelectionSummary(shopId);
  if (summary !== null) blocks.push(`[selection-summary]\n以下为当前选品候选池的最新摘要，与前文冲突时以此为准：\n${summary}\n[/selection-summary]`);
  const snapshot = await readProductSnapshot(pathname, shopId);
  if (snapshot !== null) blocks.push(snapshot);
  return blocks.length === 0 ? content : `${content}\n\n${blocks.join("\n\n")}`;
}
const defaultRuntime: Runtime = { buildContent, stream: streamChatRequest };

function useSendState(autoSendMessage?: string) {
  const [input, setInput] = useState(autoSendMessage ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [needsHistory, setNeedsHistory] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [activeTools, setActiveTools] = useState<ToolCallRecord[]>([]);
  return { input, setInput, sending, setSending, error, setError, needsHistory, setNeedsHistory,
    streamText, setStreamText, activeTools, setActiveTools };
}
type SendState = ReturnType<typeof useSendState>;

function confirmAttempt(attempt: Attempt, state: SendState, args: SendArgs): void {
  if (attempt.confirmed) return;
  attempt.confirmed = true;
  state.setInput((current) => current.trim() === attempt.content.trim() ? "" : current);
  args.onUserMessageConfirmed?.();
}

function applyEvent(event: ChatStreamEvent, attempt: Attempt, state: SendState, args: SendArgs): void {
  if (event.type === "user") {
    args.setMessages((rows) => rows.some((row) => row.id === event.message.id) ? rows : [...rows, event.message]);
    confirmAttempt(attempt, state, args);
  }
  if (event.type === "delta") state.setStreamText((text) => text + event.text);
  if (event.type === "tool_start") state.setActiveTools((calls) => [...calls, event.call]);
  if (event.type === "tool_end") state.setActiveTools((calls) => calls.map((call) => call.id === event.call.id ? event.call : call));
  if (event.type === "done") {
    args.setMessages((rows) => [...rows, event.agentMessage]);
    state.setStreamText("");
    state.setActiveTools([]);
  }
}

interface Execution {
  args: SendArgs;
  state: SendState;
  life: ChatLifetime;
  valid: () => boolean;
  attempt: Attempt;
  runtime: Runtime;
  block: () => void;
}
async function executeSend(job: Execution): Promise<ChatSendOutcome> {
  const { args, state, life, attempt, runtime } = job;
  let posted = false;
  let completed = false;
  try {
    attempt.effective = await runtime.buildContent(attempt.content, args.pathname, args.shopId!);
    if (!job.valid()) return "cancelled";
    posted = true;
    await runtime.stream(`/api/conversations/${encodeURIComponent(args.conversationId)}/messages`,
      { shopId: args.shopId, content: attempt.effective }, (event) => {
        if (!job.valid()) return;
        applyEvent(event, attempt, state, args);
        if (event.type === "error") throw new ChatStreamError(event.error);
        if (event.type === "done") completed = true;
      }, life.controller.signal);
    if (!job.valid()) return "cancelled";
    if (!completed || !attempt.confirmed) throw new ChatStreamError("未收到完整确认，请重新加载历史");
    return "completed";
  } catch (error) {
    if (!job.valid()) return "cancelled";
    const uncertain = attempt.confirmed || (posted && !(error instanceof ChatStreamError && error.delivery === "rejected"));
    if (uncertain) job.block();
    state.setError(error instanceof Error ? error.message : "发送失败，请重试");
    return uncertain ? "uncertain" : "rejected";
  } finally {
    if (job.valid()) { state.setStreamText(""); state.setActiveTools([]); }
  }
}

function useAutoSend(args: SendArgs, send: (content: string) => Promise<ChatSendOutcome>) {
  const attempted = useRef(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || attempted.current || !args.autoSendMessage || args.messages === null || !args.shopId) return;
      attempted.current = true;
      void send(args.autoSendMessage);
    });
    return () => { active = false; };
  }, [args.autoSendMessage, args.messages, args.shopId, send]);
}

function useHistoryRecovery(args: SendArgs, state: SendState, attempt: React.MutableRefObject<Attempt | null>, blocked: React.MutableRefObject<boolean>) {
  const requested = useRef(false);
  useEffect(() => {
    if (!requested.current || args.messages === null || state.sending) return;
    requested.current = false;
    const pending = attempt.current;
    const found = pending && args.messages.find((row) => row.role === "user" && !pending.baseline.has(row.id) && row.content === pending.effective);
    if (pending && found) confirmAttempt(pending, state, args);
    if (pending && !pending.confirmed) {
      state.setError("暂未确认消息是否送达，请稍后重新加载历史，不要重复发送");
      return;
    }
    blocked.current = false;
    state.setNeedsHistory(false);
    state.setError("");
  }, [args.messages, state.sending, args, state, attempt, blocked]);
  return () => { requested.current = true; };
}

export function useChatSend(args: SendArgs, runtime: Runtime = defaultRuntime) {
  const state = useSendState(args.autoSendMessage);
  const lifetime = useChatLifetime(`${args.shopId}:${args.conversationId}`);
  const busy = useRef(false);
  const blocked = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const markHistoryReload = useHistoryRecovery(args, state, attempt, blocked);
  async function send(content: string): Promise<ChatSendOutcome> {
    const life = lifetime.current.current;
    if (busy.current || blocked.current || !args.shopId || args.messages === null || !life || !lifetime.valid(life)) return "blocked";
    if (content.trim() === "") return "blocked";
    busy.current = true;
    state.setSending(true);
    state.setError("");
    state.setInput((current) => current === "" ? content : current);
    const pending: Attempt = { content, effective: content, baseline: new Set(args.messages.map((row) => row.id)), confirmed: false };
    attempt.current = pending;
    try {
      return await executeSend({ args, state, life, attempt: pending, runtime, valid: () => lifetime.valid(life),
        block: () => { blocked.current = true; state.setNeedsHistory(true); } });
    } finally {
      busy.current = false;
      if (lifetime.valid(life)) { state.setSending(false); args.onTurnComplete?.(); }
    }
  }
  useAutoSend(args, send);
  return { ...state, send, markHistoryReload };
}
