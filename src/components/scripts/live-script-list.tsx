// 用途：直播脚本列表组件（PRD 页面清单第 5 项）：按当前店铺列出直播脚本（时长/商品/阶段数/更新时间），空态引导到对话生成；切换店铺自动刷新。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { formatMinutes, formatRelativeTime } from "@/lib/time";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { LiveScriptSummary } from "@/types";

function LiveScriptCard({ script }: { script: LiveScriptSummary }) {
  const productText = script.productNames.length > 0 ? script.productNames.join("、") : "未指定商品";
  return (
    <Link
      href={`/scripts/live/${script.id}`}
      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{formatMinutes(script.duration)} 直播流程</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{script.segmentCount} 个阶段 · {productText}</p>
      </div>
      <p className="shrink-0 text-xs text-gray-400">{formatRelativeTime(script.updatedAt)}</p>
    </Link>
  );
}

// 列表加载：店铺或重载计数变化时重新拉取，过期请求作废（stale + 取消信号），响应非数组抛错走错误态。
function useLiveScriptList(currentShopId: string | null) {
  const [list, setList] = useState<LiveScriptSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setList(null);
    setError("");
    apiRequest<unknown>("GET", `/api/live-scripts?shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("直播脚本列表数据异常");
        setList(rows as LiveScriptSummary[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "直播脚本列表加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, reloadCount]);

  return { list, error, retry: () => setReloadCount((count) => count + 1) };
}

export default function LiveScriptList() {
  const { currentShopId } = useShops();
  const { list, error, retry } = useLiveScriptList(currentShopId);

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">直播脚本</h1>
        <p className="mt-1 text-sm text-gray-500">共 {list?.length ?? 0} 个直播流程脚本</p>
      </header>
      {list === null && !error && <Loading text="加载直播脚本…" />}
      {error && <ErrorMessage message={error} onRetry={retry} />}
      {list !== null && !error && (
        <>
          {list.map((script) => (
            <LiveScriptCard key={script.id} script={script} />
          ))}
          {list.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
              还没有直播脚本。在对话中让 Agent「写一个 60 分钟的直播流程脚本」，生成后会保存在这里。
            </p>
          )}
        </>
      )}
    </>
  );
}
