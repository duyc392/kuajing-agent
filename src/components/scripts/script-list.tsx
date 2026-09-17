// 用途：脚本列表页组件（PRD 页面清单第 5 项）：按当前店铺列出视频脚本（类型/时长/关联商品/钩子/风格/更新时间），空态引导到对话生成；切换店铺自动刷新。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/time";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ScriptSummary } from "@/types";

function ScriptCard({ script }: { script: ScriptSummary }) {
  return (
    <Link
      href={`/scripts/${script.id}`}
      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-[#62917d]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{script.hook}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {script.type} · {script.duration} 秒 · {script.productName ?? "通用"}{script.style ? ` · ${script.style}` : ""}
        </p>
      </div>
      <p className="shrink-0 text-xs text-gray-400">{formatRelativeTime(script.updatedAt)}</p>
    </Link>
  );
}

// 列表加载：店铺或重载计数变化时重新拉取，过期请求作废（stale + 取消信号），响应非数组抛错走错误态。
function useScriptList(currentShopId: string | null, productId?: string) {
  const [list, setList] = useState<ScriptSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setList(null);
    setError("");
    const productQuery = productId ? `&productId=${productId}` : "";
    apiRequest<unknown>("GET", `/api/scripts?shopId=${currentShopId}${productQuery}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("脚本列表数据异常");
        setList(rows as ScriptSummary[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "脚本列表加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, productId, reloadCount]);

  return { list, error, retry: () => setReloadCount((count) => count + 1) };
}

export default function ScriptList({ productId }: { productId?: string }) {
  const { currentShopId, shops } = useShops();
  const { list, error, retry } = useScriptList(currentShopId, productId);
  const shopName = shops.find((shop) => shop.id === currentShopId)?.name ?? "";

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">视频脚本</h1>
        <p className="mt-1 text-sm text-gray-500">当前店铺：{shopName} · {productId ? "当前商品" : "全部商品"}共 {list?.length ?? 0} 个视频脚本</p>
      </header>
      {list === null && !error && <Loading text="加载脚本…" />}
      {error && <ErrorMessage message={error} onRetry={retry} />}
      {list !== null && !error && (
        <>
          {list.map((script) => (
            <ScriptCard key={script.id} script={script} />
          ))}
          {list.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
              还没有视频脚本。在对话中让 Agent「写一个 30 秒的开箱视频脚本」，生成后会保存在这里。
            </p>
          )}
        </>
      )}
    </>
  );
}
