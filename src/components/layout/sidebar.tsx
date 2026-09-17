// 用途：左侧对话列表：按时间倒序显示当前店铺的对话（标题 + 最后活跃时间），支持新建对话；切换店铺后自动刷新，过期请求作废不覆盖新店铺数据。
"use client";

import { useConversationList } from "@/components/chat/use-conversation-list";
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
        className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f0f5f1] ${active ? "bg-[var(--workspace-soft)]" : ""}`}
      >
        <span className={`block truncate text-sm ${active ? "font-medium text-[#2e6350]" : "text-gray-800"}`}>
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
        className="w-full rounded-lg bg-[var(--workspace-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[#315647] disabled:opacity-50"
      >
        ＋ 新建对话
      </button>
    </div>
  );
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
      <CreateButton disabled={creating || !currentShopId} onClick={() => void handleCreate()} />
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
