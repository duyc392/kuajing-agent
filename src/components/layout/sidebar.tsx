// 用途：左侧对话列表：按时间倒序显示当前店铺的对话（标题 + 最后活跃时间），支持新建对话；切换店铺后自动刷新。
"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/time";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ConversationSummary } from "@/types";

function ConversationItem({ conversation }: { conversation: ConversationSummary }) {
  return (
    <li className="rounded-lg px-3 py-2 hover:bg-gray-50">
      <span className="block truncate text-sm text-gray-800">{conversation.title}</span>
      <span className="mt-0.5 block text-xs text-gray-400">{formatRelativeTime(conversation.updatedAt)}</span>
    </li>
  );
}

export default function Sidebar() {
  const { currentShopId } = useShops();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    if (!currentShopId) return;
    try {
      setList(await apiRequest<ConversationSummary[]>("GET", `/api/conversations?shopId=${currentShopId}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "对话列表加载失败");
    }
  }, [currentShopId]);

  useEffect(() => {
    setList(null);
    void reload();
  }, [reload]);

  async function handleCreate() {
    if (!currentShopId || creating) return;
    setCreating(true);
    try {
      await apiRequest("POST", "/api/conversations", { shopId: currentShopId });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建对话失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !currentShopId}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          ＋ 新建对话
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {!currentShopId && <p className="px-3 py-6 text-center text-xs text-gray-400">还没有店铺，请先在右上角创建店铺。</p>}
        {currentShopId && list === null && !error && <Loading text="加载对话…" />}
        {error && <ErrorMessage message={error} onRetry={() => void reload()} />}
        {currentShopId && list !== null && !error && (
          <ul className="grid gap-0.5">
            {list.map((conversation) => (
              <ConversationItem key={conversation.id} conversation={conversation} />
            ))}
            {list.length === 0 && <p className="px-3 py-6 text-center text-xs text-gray-400">还没有对话，点击上方按钮开始。</p>}
          </ul>
        )}
      </nav>
    </aside>
  );
}
