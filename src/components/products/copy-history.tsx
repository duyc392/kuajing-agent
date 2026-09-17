// 用途：文案版本卡片：列出商品全部文案版本、切换当前版本、任选两个版本并排对比（逐字段标注相同/不同）；纯展示组件，数据与切换经 apiRequest。
"use client";

import { useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import ErrorMessage from "@/components/shared/error-message";
import type { CopyView } from "@/types";

interface CopyHistoryProps {
  productId: string;
  shopId: string;
  copies: CopyView[];
  /** 挂进商品档案标签页时为 true：不自带卡片壳。 */
  flat?: boolean;
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
    <li className="rounded-lg bg-[#f6f9f6] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{copy.title}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`status-pill !px-2 !py-0.5 ${isCurrent ? "" : ""}`} data-tone={isCurrent ? "ok" : undefined}>
            {isCurrent ? "当前生效" : "草稿"}
          </span>
          {compareLabel && (
            <span className="status-pill !px-2 !py-0.5 text-[#5b4a86]" style={{ background: "#efeaf7" }}>对比 {compareLabel}</span>
          )}
          {canCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(copy.id)}
              className="btn btn-outline !min-h-0 !px-2 !py-0.5 text-xs"
            >
              对比
            </button>
          )}
          {!isCurrent && (
            <button
              type="button"
              onClick={() => onApply(copy.id)}
              disabled={switching}
              className="btn btn-outline !min-h-0 !px-2 !py-0.5 text-xs"
            >
              设为当前
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--workspace-muted)]">{metaText(copy)}</p>
      <p className="mt-2 whitespace-pre-wrap text-xs text-[#3b534c]">{copy.description}</p>
      {copy.sellingPoints && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--workspace-muted)]">{copy.sellingPoints}</p>}
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
    <div className="rounded-xl border border-[var(--workspace-border)] bg-[#f0f4f1] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">版本对比</p>
        <button type="button" onClick={onClose} className="btn btn-outline !min-h-0 !px-2 !py-0.5 text-xs">
          关闭对比
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <p className="rounded-lg bg-white px-2 py-1 text-xs text-[var(--workspace-muted)]">{metaText(a)}{a.isCurrent ? " · 当前" : ""}</p>
        <p className="rounded-lg bg-white px-2 py-1 text-xs text-[var(--workspace-muted)]">{metaText(b)}{b.isCurrent ? " · 当前" : ""}</p>
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

export default function CopyHistory({ productId, shopId, copies, flat }: CopyHistoryProps) {
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
      <div className={flat ? "" : "page-card p-5"}>
        <h2 className="text-base font-semibold">文案版本（0）</h2>
        <p className="py-6 text-center text-sm text-[var(--workspace-muted)]">
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
      <div className={flat ? "" : "page-card p-5"}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">文案版本（{copies.length}）</h2>
          {copies.length < 2 && <p className="text-xs text-[var(--workspace-muted)]">至少需要两个版本才能对比</p>}
        </div>
        <CopyList copies={effectiveCopies} switching={switching} compareIds={compareIds} onApply={handleApply} onToggleCompare={handleToggleCompare} />
      </div>
    </div>
  );
}
