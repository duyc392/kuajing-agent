// 用途：直播脚本详情页组件（PRD 页面清单第 5 项）：组装详情加载、流程展示与整段流程编辑；
// 展示各阶段（名称/分钟/目标/话术），支持编辑后保存（总时长由阶段分钟数自动重算）。
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { formatMinutes, formatRelativeTime } from "@/lib/time";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import LiveScriptEditForm from "@/components/scripts/live-script-edit-form";
import { useLiveScriptDetail } from "@/components/scripts/use-live-script-detail";
import type { LiveSegment } from "@/types";

// 流程展示：逐阶段渲染名称、分钟数、目标与话术。
function SegmentList({ segments }: { segments: LiveSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-xs text-gray-400">（无阶段数据，请在对话中让 Agent 重新生成脚本）</p>;
  }
  return (
    <ol className="grid gap-2">
      {segments.map((segment, index) => (
        <li key={index} className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-400">阶段 {index + 1} · {segment.phase} · {segment.minutes} 分钟</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{segment.goal}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{segment.script}</p>
        </li>
      ))}
    </ol>
  );
}

export default function LiveScriptDetail({ scriptId }: { scriptId: string }) {
  const { currentShopId } = useShops();
  const { script, error, refresh } = useLiveScriptDetail(scriptId, currentShopId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const savingRef = useRef(false);

  // 保存整段流程（ref 同步锁防连点）：服务端重算总时长。
  async function handleSave(segments: LiveSegment[]) {
    if (!currentShopId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await apiRequest<unknown>("PATCH", `/api/live-scripts/${scriptId}?shopId=${currentShopId}`, { segments });
      setEditing(false);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }
  if (script === null && !error) return <Loading text="加载直播脚本…" />;
  // 加载失败（含脚本不存在 / 跨店铺 404）：渲染错误提示与重试，主内容区不空白。
  if (script === null) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
        <ErrorMessage message={error} onRetry={refresh} />
      </div>
    );
  }

  const visibleError = error || actionError;
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/scripts" className="text-sm text-blue-600 hover:underline">← 返回脚本列表</Link>
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            编辑
          </button>
        )}
      </div>
      {visibleError && <ErrorMessage message={visibleError} onRetry={refresh} />}
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{formatMinutes(script.duration)} 直播流程</h1>
        <p className="mt-1 text-sm text-gray-500">
          {script.productNames.length > 0 ? script.productNames.join("、") : "未指定商品"} · 更新于 {formatRelativeTime(script.updatedAt)}
        </p>
      </header>
      {editing ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <LiveScriptEditForm segments={script.segments} submitting={saving} onSubmit={handleSave} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-2 text-sm font-medium text-gray-900">直播流程（{script.segments.length} 个阶段 · 共 {formatMinutes(script.duration)}）</p>
          <SegmentList segments={script.segments} />
          <p className="mt-3 text-xs text-gray-400">要整体调整流程结构，也可在对话中让 Agent 重新生成直播脚本。</p>
        </div>
      )}
    </div>
  );
}
