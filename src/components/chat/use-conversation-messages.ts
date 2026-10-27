// 用途：新对话使用显式种子，旧对话默认走轻量 GET；重试总是重新读取历史。
"use client";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { MessageView } from "@/types";

export function useConversationMessages(conversationId: string, shopId: string | null, initialMessages?: MessageView[]) {
  const key = `${shopId}:${conversationId}`;
  const seed = useRef({ key, initialMessages });
  const [state, setState] = useState<{ key: string; messages: MessageView[] | null; error: string }>({
    key, messages: initialMessages ?? null, error: "",
  });
  const [reloadCount, setReloadCount] = useState(0);
  useEffect(() => {
    if (!shopId) return;
    let stale = false;
    const controller = new AbortController();
    const seeded = reloadCount === 0 && seed.current.key === key ? seed.current.initialMessages : undefined;
    setState({ key, messages: seeded ?? null, error: "" });
    if (seeded !== undefined) return () => { stale = true; controller.abort(); };
    apiRequest<unknown>("GET", `/api/conversations/${encodeURIComponent(conversationId)}?shopId=${encodeURIComponent(shopId)}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("消息记录数据异常");
        setState({ key, messages: rows as MessageView[], error: "" });
      })
      .catch((error: unknown) => {
        if (!stale) setState({ key, messages: null, error: error instanceof Error ? error.message : "消息记录加载失败" });
      });
    return () => { stale = true; controller.abort(); };
  }, [conversationId, shopId, key, reloadCount]);
  const setMessages = (update: (rows: MessageView[]) => MessageView[]) => {
    setState((current) => current.key === key ? { ...current, messages: update(current.messages ?? []) } : current);
  };
  return {
    messages: state.key === key ? state.messages : null,
    error: state.key === key ? state.error : "",
    setMessages,
    retry: () => { setState({ key, messages: null, error: "" }); setReloadCount((count) => count + 1); },
  };
}
