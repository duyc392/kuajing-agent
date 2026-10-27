// 用途：对话列表、新建与删除；新建显式传空历史，旧对话不传初始化种子。
"use client";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { ConversationSummary, SelectConversation } from "@/types";

function useConversationListLoader(shopId: string | null, revision: string) {
  const [state, setState] = useState<{ shopId: string | null; list: ConversationSummary[] | null; error: string }>({ shopId, list: null, error: "" });
  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setState({ shopId, list: null, error: "" });
    if (shopId) apiRequest<unknown>("GET", `/api/conversations?shopId=${encodeURIComponent(shopId)}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("对话列表数据异常");
        setState({ shopId, list: rows as ConversationSummary[], error: "" });
      }).catch((error: unknown) => {
        if (!stale) setState({ shopId, list: null, error: error instanceof Error ? error.message : "对话列表加载失败" });
      });
    return () => { stale = true; controller.abort(); };
  }, [shopId, revision]);
  return { list: state.shopId === shopId ? state.list : null, error: state.shopId === shopId ? state.error : "" };
}

function useShopScope(shopId: string | null) {
  const scope = useRef({ shopId, active: true });
  if (scope.current.shopId !== shopId) { scope.current.active = false; scope.current = { shopId, active: true }; }
  useEffect(() => {
    const current = scope.current;
    current.active = true;
    return () => { current.active = false; };
  }, [shopId]);
  return scope.current;
}
type ShopScope = ReturnType<typeof useShopScope>;
interface MutationArgs { scope: ShopScope; reload: () => void; fail: (message: string) => void }

function useCreateConversation(args: MutationArgs, select: SelectConversation) {
  const busy = useRef(false);
  const [creating, setCreating] = useState(false);
  async function handleCreate(content?: string) {
    if (busy.current || !args.scope.shopId) return;
    busy.current = true;
    setCreating(true);
    args.fail("");
    try {
      const created = await apiRequest<ConversationSummary>("POST", "/api/conversations", { shopId: args.scope.shopId });
      if (!args.scope.active) return;
      args.reload();
      select(created.id, { initialMessages: [], autoSendMessage: content });
    } catch (error) {
      if (args.scope.active) args.fail(error instanceof Error ? error.message : "新建对话失败");
    } finally {
      busy.current = false;
      if (args.scope.active) setCreating(false);
    }
  }
  useEffect(() => { setCreating(false); }, [args.scope]);
  return { creating, handleCreate };
}

function useDeleteConversation(args: MutationArgs, onDeleted?: (id: string) => void) {
  const busy = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  async function handleDelete(id: string) {
    if (busy.current || !args.scope.shopId) return;
    busy.current = true;
    setDeletingId(id);
    args.fail("");
    try {
      await apiRequest<unknown>("DELETE", `/api/conversations/${encodeURIComponent(id)}?shopId=${encodeURIComponent(args.scope.shopId)}`);
      if (!args.scope.active) return;
      args.reload();
      onDeleted?.(id);
    } catch (error) {
      if (args.scope.active) args.fail(error instanceof Error ? error.message : "删除对话失败");
    } finally {
      busy.current = false;
      if (args.scope.active) setDeletingId(null);
    }
  }
  useEffect(() => { setDeletingId(null); }, [args.scope]);
  return { deletingId, handleDelete };
}

export function useConversationList(shopId: string | null, select: SelectConversation, refreshSignal = 0, onDeleted?: (id: string) => void) {
  const [reloadCount, setReloadCount] = useState(0);
  const [mutationError, setMutationError] = useState("");
  const scope = useShopScope(shopId);
  const reload = () => setReloadCount((count) => count + 1);
  const loaded = useConversationListLoader(shopId, `${refreshSignal}:${reloadCount}`);
  useEffect(() => { setMutationError(""); }, [shopId]);
  const args = { scope, reload, fail: setMutationError };
  const create = useCreateConversation(args, select);
  const remove = useDeleteConversation(args, onDeleted);
  return { list: loaded.list, error: mutationError || loaded.error, ...create, ...remove,
    retry: () => { setMutationError(""); reload(); } };
}
