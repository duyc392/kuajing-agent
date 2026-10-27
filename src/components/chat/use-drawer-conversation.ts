// 用途：抽屉读取最近对话，首次发送才新建；新建种子与首条确认独立。
"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useChatLifetime } from "./use-chat-lifetime";
import type { ConversationInitialization, ConversationSummary } from "@/types";

interface DrawerSelection extends ConversationInitialization { id: string; shopId: string }
interface Loaded { shopId: string | null; selection: DrawerSelection | null }

function useRecentConversation(open: boolean, shopId: string | null) {
  const [loaded, setLoaded] = useState<Loaded>({ shopId: null, selection: null });
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [observedShop, setObservedShop] = useState(shopId);
  if (observedShop !== shopId) {
    setObservedShop(shopId);
    setLoaded({ shopId: null, selection: null });
    setError("");
  }
  useEffect(() => {
    if (!open || !shopId || loaded.shopId === shopId) return;
    let stale = false;
    const controller = new AbortController();
    setError("");
    apiRequest<ConversationSummary[]>("GET", `/api/conversations?shopId=${encodeURIComponent(shopId)}`, undefined, controller.signal)
      .then((list) => {
        if (!stale) setLoaded({ shopId, selection: list[0] ? { id: list[0].id, shopId } : null });
      }).catch((cause: unknown) => {
        if (!stale) setError(cause instanceof Error ? cause.message : "对话初始化失败");
      });
    return () => { stale = true; controller.abort(); };
  }, [open, shopId, loaded.shopId, revision]);
  return { loaded, setLoaded, error,
    retry: () => { setLoaded({ shopId: null, selection: null }); setRevision((count) => count + 1); } };
}

export function useDrawerConversation(open: boolean, shopId: string | null) {
  const recent = useRecentConversation(open, shopId);
  const lifetime = useChatLifetime(shopId ?? "");
  const selection = shopId && recent.loaded.shopId === shopId ? recent.loaded.selection : null;
  async function startConversation(content: string): Promise<void> {
    const life = lifetime.current.current;
    if (!shopId || !life || !lifetime.valid(life)) return;
    const created = await apiRequest<ConversationSummary>("POST", "/api/conversations", { shopId }, life.controller.signal);
    if (lifetime.valid(life)) recent.setLoaded({ shopId, selection: { id: created.id, shopId, initialMessages: [], autoSendMessage: content } });
  }
  return {
    selection, resolved: recent.loaded.shopId === shopId, error: recent.error,
    startConversation, retry: recent.retry,
    confirmFirstMessage: () => recent.setLoaded((current) => current.selection?.id === selection?.id && current.shopId === shopId
      ? { ...current, selection: { ...current.selection!, autoSendMessage: undefined } } : current),
  };
}
