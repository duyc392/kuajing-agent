// 用途：文案历史标签页（PRD 故事 19）：列出商品全部文案版本、切换当前版本、任选两个版本并排对比（逐字段标注相同/不同）；纯展示组件，数据与切换经 apiRequest。
"use client";

import { useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import ErrorMessage from "@/components/shared/error-message";
import type { CopyView } from "@/types";

interface CopyHistoryProps {
  productId: string;
  shopId: string;
  copies: CopyView[];
}

interface CopyRowProps {
  copy: CopyView;
  isCurrent: boolean;
  switching: boolean;
  compareLabel: string | null;
  canCompare: boolean;
  onApply: (id: string) => void;
  onToggleCompare: (id: string) => void;
}

function metaText(copy: CopyView): string {
  return `语言 ${copy.language} · 第 ${copy.version} 版 · ${copy.source === "ai" ? "AI 生成" : "人工修改"}`;
}

function CopyRow({ copy, isCurrent, switching, compareLabel, canCompare, onApply, onToggleCompare }: CopyRowProps) {
  return (
    <li className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-gray-900">{copy.title}</p>
        <div className="flex shrink-0 items-center gap-2">
          {compareLabel && (
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">对比 {compareLabel}</span>
          )}
          {canCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(copy.id)}
              className="rounded-lg border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              对比
            </button>
          )}
          {isCurrent ? (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">当前</span>
          ) : (
            <button
              type="button"
              onClick={() => onApply(copy.id)}
              disabled={switching}
              className="rounded-lg border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              设为当前
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">{metaText(copy)}</p>
      <p className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{copy.description}</p>
      {copy.sellingPoints && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{copy.sellingPoints}</p>}
    </li>
  );
}

function CopyList({ copies, switching, compareIds, onApply, onToggleCompare }: { copies: CopyView[]; switching: boolean; compareIds: string[]; onApply: (id: string) => void; onToggleCompare: (id: string) => void }) {
  return (
    <ul className="grid gap-3">
      {copies.map((copy) => (
        <CopyRow
          key={copy.id}
          copy={copy}
          isCurrent={copy.isCurrent}
          switching={switching}
          compareLabel={compareIds[0] === copy.id ? "A" : compareIds[1] === copy.id ? "B" : null}
          canCompare={copies.length >= 2}
          onApply={onApply}
          onToggleCompare={onToggleCompare}
        />
      ))}
    </ul>
  );
}

function CompareField({ label, left, right }: { label: string; left: string; right: string }) {
  const mark = left === right ? "相同" : "不同";
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-gray-100 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label} · {mark}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-800">{left === "" ? "（无）" : left}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label} · {mark}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-800">{right === "" ? "（无）" : right}</p>
      </div>
    </div>
  );
}

function ComparePanel({ a, b, onClose }: { a: CopyView; b: CopyView; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">版本对比</p>
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">
          关闭对比
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <p className="rounded-lg bg-white px-2 py-1 text-xs text-gray-600">{metaText(a)}{a.isCurrent ? " · 当前" : ""}</p>
        <p className="rounded-lg bg-white px-2 py-1 text-xs text-gray-600">{metaText(b)}{b.isCurrent ? " · 当前" : ""}</p>
      </div>
      <div className="mt-2 rounded-lg bg-white p-3">
        <CompareField label="标题" left={a.title} right={b.title} />
        <CompareField label="描述" left={a.description} right={b.description} />
        <CompareField label="卖点与利益点" left={a.sellingPoints ?? ""} right={b.sellingPoints ?? ""} />
      </div>
    </div>
  );
}

// 切换当前版本的状态管理：ref 同步锁防连点；失败时记住目标版本，错误横幅的「重试」真正重新执行切换。
function useCopySwitch(productId: string, shopId: string, onApplied: (copyId: string) => void) {
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const [switchError, setSwitchError] = useState("");
  const [failedCopyId, setFailedCopyId] = useState<string | null>(null);

  async function handleApply(copyId: string) {
    if (switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    setSwitchError("");
    setFailedCopyId(null);
    try {
      await apiRequest<unknown>("POST", `/api/products/${productId}/copies?shopId=${shopId}`, { copyId });
      onApplied(copyId);
    } catch (e) {
      setFailedCopyId(copyId);
      setSwitchError(e instanceof Error ? e.message : "切换失败，请重试");
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  function retryFailed() {
    if (failedCopyId !== null) void handleApply(failedCopyId);
  }

  return { switching, switchError, handleApply, retryFailed };
}

export default function CopyHistory({ productId, shopId, copies }: CopyHistoryProps) {
  // 当前版本覆盖值与对比选择列表：只动本标签页局部状态，不整页刷新（保留标签页位置）。
  const [currentCopyId, setCurrentCopyId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const { switching, switchError, handleApply, retryFailed } = useCopySwitch(productId, shopId, setCurrentCopyId);

  const effectiveCopies = currentCopyId === null ? copies : copies.map((copy) => ({ ...copy, isCurrent: copy.id === currentCopyId }));

  function handleToggleCompare(copyId: string) {
    setCompareIds((prev) => {
      if (prev.includes(copyId)) return prev.filter((id) => id !== copyId);
      if (prev.length >= 2) return [prev[0], copyId];
      return [...prev, copyId];
    });
  }

  if (copies.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="py-6 text-center text-sm text-gray-400">
          还没有文案版本。在对话中让 Agent 生成文案后，这里会列出每个版本并支持对比与切换。
        </p>
      </div>
    );
  }

  const compareCopies = compareIds
    .map((id) => effectiveCopies.find((copy) => copy.id === id))
    .filter((copy): copy is CopyView => Boolean(copy));

  return (
    <div className="grid gap-3">
      {switchError && <ErrorMessage message={switchError} onRetry={retryFailed} />}
      {compareCopies.length === 2 && <ComparePanel a={compareCopies[0]} b={compareCopies[1]} onClose={() => setCompareIds([])} />}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        {copies.length < 2 && <p className="mb-2 text-xs text-gray-400">至少需要两个文案版本才能使用版本对比。</p>}
        <CopyList copies={effectiveCopies} switching={switching} compareIds={compareIds} onApply={handleApply} onToggleCompare={handleToggleCompare} />
      </div>
    </div>
  );
}
