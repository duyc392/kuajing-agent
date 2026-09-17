// 用途：记忆管理面板（PRD 故事 43）：按分类展示 Agent 长期记忆，支持编辑分类/内容与删除；
// 记忆由对话结束后的提取器自动沉淀（故事 41），本页只做查看与纠错管理。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { MEMORY_CATEGORIES } from "@/config/memory";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { MemoryEntryView } from "@/types";

// 记忆列表加载：店铺或重载计数变化时重新拉取，过期请求作废 + 取消信号。
function useMemories(currentShopId: string | null) {
  const [memories, setMemories] = useState<MemoryEntryView[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setMemories(null);
    setError("");
    apiRequest<unknown>("GET", `/api/memory?shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("记忆数据异常");
        setMemories(rows as MemoryEntryView[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "记忆加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, reloadCount]);

  return { memories, error, refresh: () => setReloadCount((count) => count + 1) };
}

// 保存与删除写操作：ref 同步锁防连点；save 返回是否成功，调用方只在成功后关闭编辑态（失败保留用户输入）。
function useMemoryActions(currentShopId: string | null, refresh: () => void) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionRef = useRef(false);

  async function save(id: string, values: { category: string; content: string }): Promise<boolean> {
    if (!currentShopId || actionRef.current) return false;
    actionRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await apiRequest<unknown>("PATCH", `/api/memory/${id}?shopId=${currentShopId}`, values);
      refresh();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "保存失败，请重试");
      return false;
    } finally {
      actionRef.current = false;
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!currentShopId || actionRef.current) return;
    if (!window.confirm("确定删除这条记忆吗？删除后 Agent 将不再参考它。")) return;
    actionRef.current = true;
    setActionError("");
    try {
      await apiRequest<unknown>("DELETE", `/api/memory/${id}?shopId=${currentShopId}`);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败，请重试");
    } finally {
      actionRef.current = false;
    }
  }

  return { saving, actionError, save, remove };
}

function MemoryEditForm({ entry, submitting, onSubmit, onCancel }: {
  entry: MemoryEntryView;
  submitting: boolean;
  onSubmit: (values: { category: string; content: string }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<string>(entry.category);
  const [content, setContent] = useState(entry.content);

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (content.trim() === "") return;
        onSubmit({ category, content: content.trim() });
      }}
    >
      <select className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
        {MEMORY_CATEGORIES.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <textarea className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" rows={2} value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} />
      <div className="flex gap-2">
        <button type="submit" disabled={submitting || content.trim() === ""} className="btn btn-primary btn-sm">
          {submitting ? "保存中…" : "保存"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
      </div>
    </form>
  );
}

function MemoryEntryItem({ entry, editing, submitting, onStartEdit, onCancelEdit, onSave, onDelete }: {
  entry: MemoryEntryView;
  editing: boolean;
  submitting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: { category: string; content: string }) => void;
  onDelete: () => void;
}) {
  if (editing) {
    return <MemoryEditForm entry={entry} submitting={submitting} onSubmit={onSave} onCancel={onCancelEdit} />;
  }
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="whitespace-pre-wrap text-sm text-gray-800">{entry.content}</p>
      <div className="flex shrink-0 gap-1">
        <button onClick={onStartEdit} className="btn btn-outline !min-h-0 !px-2 !py-1 text-xs">编辑</button>
        <button onClick={onDelete} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">删除</button>
      </div>
    </div>
  );
}

// 单个分类分组卡片：标题 + 该分类下的记忆条目列表。
function MemoryGroupCard({ category, entries, editingId, saving, onStartEdit, onCancelEdit, onSave, onDelete }: {
  category: string;
  entries: MemoryEntryView[];
  editingId: string | null;
  saving: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (id: string, values: { category: string; content: string }) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="page-card p-5">
      <p className="mb-2 text-sm font-medium">{category}</p>
      <div className="grid gap-2">
        {entries.map((entry) => (
          <MemoryEntryItem
            key={entry.id}
            entry={entry}
            editing={editingId === entry.id}
            submitting={saving}
            onStartEdit={() => onStartEdit(entry.id)}
            onCancelEdit={onCancelEdit}
            onSave={(values) => onSave(entry.id, values)}
            onDelete={() => onDelete(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function MemoryManager() {
  const { currentShopId } = useShops();
  const { memories, error, refresh } = useMemories(currentShopId);
  const { saving, actionError, save, remove } = useMemoryActions(currentShopId, refresh);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }
  if (memories === null && !error) return <Loading text="加载记忆…" />;
  if (memories === null) return <ErrorMessage message={error} onRetry={refresh} />;

  const groups = MEMORY_CATEGORIES
    .map((category) => ({ category, entries: memories.filter((memory) => memory.category === category) }))
    .filter((group) => group.entries.length > 0);

  return (
    <div className="grid gap-4">
      {(error || actionError) && <ErrorMessage message={error || actionError} onRetry={refresh} />}
      {groups.length === 0 && (
        <p className="page-card border-dashed p-8 text-center text-sm text-[var(--workspace-muted)]">
          暂无记忆。在对话中告诉 Agent 你的店铺定位、目标人群或内容偏好，它会自动记住。
        </p>
      )}
      {groups.map((group) => (
        <MemoryGroupCard
          key={group.category}
          category={group.category}
          entries={group.entries}
          editingId={editingId}
          saving={saving}
          onStartEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onSave={(id, values) => {
            void save(id, values).then((ok) => { if (ok) setEditingId(null); });
          }}
          onDelete={remove}
        />
      ))}
    </div>
  );
}
