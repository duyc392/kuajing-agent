// 用途：左侧对话列表：按时间倒序显示当前店铺的对话（标题 + 最后活跃时间），支持新建对话；切换店铺后自动刷新，过期请求作废不覆盖新店铺数据。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/time";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ConversationSummary } from "@/types";

interface ConversationItemProps {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
}

function ConversationItem({ conversation, active, onSelect }: ConversationItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
      >
        <span className={`block truncate text-sm ${active ? "font-medium text-blue-700" : "text-gray-800"}`}>
          {conversation.title}
        </span>
        <span className="mt-0.5 block text-xs text-gray-400">{formatRelativeTime(conversation.updatedAt)}</span>
      </button>
    </li>
  );
}

interface ConversationNavProps {
  currentShopId: string | null;
  list: ConversationSummary[] | null;
  error: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

function ConversationNav({ currentShopId, list, error, activeId, onSelect, onRetry }: ConversationNavProps) {
  if (!currentShopId) {
    return <p className="px-3 py-6 text-center text-xs text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }
  if (error) return <ErrorMessage message={error} onRetry={onRetry} />;
  if (list === null) return <Loading text="加载对话…" />;
  return (
    <ul className="grid gap-0.5">
      {list.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeId}
          onSelect={onSelect}
        />
      ))}
      {list.length === 0 && <p className="px-3 py-6 text-center text-xs text-gray-400">还没有对话，点击上方按钮开始。</p>}
    </ul>
  );
}

interface CreateButtonProps {
  disabled: boolean;
  onClick: () => void;
}

function CreateButton({ disabled, onClick }: CreateButtonProps) {
  return (
    <div className="border-b border-gray-100 p-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        ＋ 新建对话
      </button>
    </div>
  );
}

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
function useConversationList(currentShopId: string | null, handleSelect: (id: string) => void, refreshSignal: number) {
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

  async function handleCreate() {
    // creatingRef 同步锁：React 状态更新是异步的，同一瞬间连点两次会都读到 creating=false，必须用 ref 立即占位。
    if (creatingRef.current || !currentShopId) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const created = await apiRequest<ConversationSummary>("POST", "/api/conversations", { shopId: currentShopId });
      setReloadCount((count) => count + 1);
      handleSelect(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建对话失败");
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

interface SidebarProps {
  activeId?: string | null;
  onSelect?: (id: string) => void;
  refreshSignal?: number;
}

export default function Sidebar({ activeId = null, onSelect, refreshSignal = 0 }: SidebarProps) {
  const { currentShopId } = useShops();
  const handleSelect = onSelect ?? (() => undefined);
  const { list, error, creating, handleCreate, retry } = useConversationList(currentShopId, handleSelect, refreshSignal);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <CreateButton disabled={creating || !currentShopId} onClick={handleCreate} />
      <nav className="flex-1 overflow-y-auto p-2">
        <ConversationNav
          currentShopId={currentShopId}
          list={list}
          error={error}
          activeId={activeId}
          onSelect={handleSelect}
          onRetry={retry}
        />
      </nav>
    </aside>
  );
}
