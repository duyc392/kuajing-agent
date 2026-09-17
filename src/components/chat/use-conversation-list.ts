// 用途：复用既有对话列表与新建逻辑，供侧栏和首页使用；首条消息仍交给 ChatPanel。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { ConversationSummary } from "@/types";
// 列表拉取：店铺或重载计数变化时重新加载，过期请求作废（stale + 取消信号），响应非数组时抛错走错误态。
function useConversationListLoader(currentShopId: string | null, reloadCount: number) {
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setList(null);
    setError("");
    apiRequest<unknown>("GET", `/api/conversations?shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("对话列表数据异常");
        setList(rows as ConversationSummary[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "对话列表加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, reloadCount]);

  return { list, error, setError };
}

// 对话列表状态集中管理：加载、错误重试、新建（同步锁防连点），Sidebar 只负责组合 UI。
export function useConversationList(currentShopId: string | null, handleSelect: (id: string, content?: string) => void, refreshSignal = 0) {
  const lastSignal = useRef(0);
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const { list, error, setError } = useConversationListLoader(currentShopId, reloadCount);

  useEffect(() => {
    if (refreshSignal === lastSignal.current) return;
    lastSignal.current = refreshSignal;
    setReloadCount((count) => count + 1);
  }, [refreshSignal]);

  const activeShop = useRef(currentShopId);
  useEffect(() => {
    activeShop.current = currentShopId;
    return () => { activeShop.current = null; };
  }, [currentShopId]);

  async function handleCreate(content?: string) {
    // creatingRef 同步锁：React 状态更新是异步的，同一瞬间连点两次会都读到 creating=false，必须用 ref 立即占位。
    if (creatingRef.current || !currentShopId) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const created = await apiRequest<ConversationSummary>("POST", "/api/conversations", { shopId: currentShopId });
      if (activeShop.current !== currentShopId) return;
      setReloadCount((count) => count + 1);
      handleSelect(created.id, content);
    } catch (e) {
      if (activeShop.current === currentShopId) setError(e instanceof Error ? e.message : "新建对话失败");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return {
    list,
    error,
    creating,
    handleCreate,
    retry: () => setReloadCount((count) => count + 1),
  };
}
