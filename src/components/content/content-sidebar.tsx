// 用途：内容创作页左侧栏（规格 2.1）：展示当前店铺商品列表，带「已发 N 条视频」计数胶囊；点选联动右侧五个子页；新建商品不在此处受理（去商品页）。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ProductSummary } from "@/types";
import type { PublishedVideoView } from "@/types/content";

interface ContentSidebarProps {
  products: ProductSummary[] | null;
  error: string;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// 每个商品的已发视频数：与商品列表并行拉取，计数来自内容运营数据源（当前为 Mock）；
// 单个商品失败不中断整个列表，但该商品标记为「统计失败」而非静默当作 0 条。
function useVideoCounts(products: ProductSummary[] | null, shopId: string | null) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!shopId || products === null) return;
    let stale = false;
    setCounts({});
    setFailedIds(new Set());
    void Promise.all(
      products.map((product) =>
        apiRequest<PublishedVideoView[]>("GET", `/api/content/published-videos?productId=${product.id}&shopId=${shopId}`)
          .then((list) => ({ id: product.id, count: list.length, ok: true as const }))
          .catch(() => ({ id: product.id, count: 0, ok: false as const })),
      ),
    ).then((rows) => {
      if (stale) return;
      const next: Record<string, number> = {};
      const failed = new Set<string>();
      for (const row of rows) {
        if (row.ok) next[row.id] = row.count;
        else failed.add(row.id);
      }
      setCounts(next);
      setFailedIds(failed);
    });
    return () => {
      stale = true;
    };
  }, [products, shopId]);

  return { counts, failedIds };
}

export default function ContentSidebar({ products, error, onRetry, selectedId, onSelect }: ContentSidebarProps) {
  const { currentShopId } = useShops();
  const { counts, failedIds } = useVideoCounts(products, currentShopId);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">选择创作商品</p>
      </div>
      {error && <ErrorMessage message={error} onRetry={onRetry} />}
      {products === null && !error && <Loading text="加载商品…" />}
      {products !== null && !error && (
        <ul className="grid gap-1.5">
          {products.map((product) => {
            const count = counts[product.id];
            const active = selectedId === product.id;
            return (
              <li key={product.id}>
                <button
                  onClick={() => onSelect(product.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${active ? "bg-blue-50 ring-1 ring-blue-300" : "bg-white hover:bg-gray-100"}`}
                >
                  <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                  <p className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                    <span>{product.category ?? "未分类"}</span>
                    {failedIds.has(product.id) ? (
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600" title="视频统计接口失败">统计失败</span>
                    ) : count !== undefined ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${count > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                        {count > 0 ? `已发 ${count} 条视频` : "0 条视频"}
                      </span>
                    ) : null}
                  </p>
                </button>
              </li>
            );
          })}
          {products.length === 0 && (
            <li className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
              还没有商品，请先在「商品」页建档。
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}
