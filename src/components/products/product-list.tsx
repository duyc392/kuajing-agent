// 用途：商品列表组件：按当前店铺展示商品（名称、品类、价格、文案版本数、变体数），切换店铺后自动刷新，含加载 / 错误重试 / 空态引导。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ProductListRow, ProductSummary } from "@/types";

function toSummary(row: ProductListRow): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    variantCount: row.variants.length,
    copyCount: row.copies.length,
  };
}

function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
        <p className="mt-0.5 text-xs text-gray-500">{product.category ?? "未分类"}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-gray-900">{product.price !== null ? product.price : "—"}</p>
        <p className="mt-0.5 text-xs text-gray-500">文案 {product.copyCount} 版 · 变体 {product.variantCount}</p>
      </div>
    </Link>
  );
}

export default function ProductList() {
  const { currentShopId, shops } = useShops();
  const [list, setList] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const shopName = shops.find((shop) => shop.id === currentShopId)?.name ?? "";

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    setList(null);
    setError("");
    apiRequest<ProductListRow[]>("GET", `/api/products?shopId=${currentShopId}`)
      .then((rows) => { if (!stale) setList(rows.map(toSummary)); })
      .catch((e: Error) => { if (!stale) setError(e.message || "商品列表加载失败"); });
    return () => { stale = true; };
  }, [currentShopId, reloadCount]);

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-3 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">商品</h1>
        <p className="mt-1 text-sm text-gray-500">当前店铺：{shopName} · 共 {list?.length ?? 0} 个商品</p>
      </header>
      {list === null && !error && <Loading text="加载商品…" />}
      {error && <ErrorMessage message={error} onRetry={() => setReloadCount((count) => count + 1)} />}
      {list !== null && !error && (
        <>
          {list.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
          {list.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
              还没有商品。AI 对话中枢上线后，可以直接让 Agent 帮你调研选品并建档。
            </p>
          )}
        </>
      )}
    </div>
  );
}
