// 用途：商品列表组件：按当前店铺展示商品（名称、品类、价格、文案版本数、变体数），切换店铺后自动刷新，含加载 / 错误重试 / 空态引导。
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { formatPrice, parseNullableNumber } from "@/lib/numbers";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import CreateProductForm from "@/components/products/product-create-form";
import type { ProductSummary } from "@/types";

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
        <p className="text-sm font-medium text-gray-900">{product.price !== null ? `¥${formatPrice(product.price)}` : "—"}</p>
        <p className="mt-0.5 text-xs text-gray-500">文案 {product.copyCount} 版 · 变体 {product.variantCount}</p>
      </div>
    </Link>
  );
}

// 商品列表数据与操作：加载（过期作废 + 取消信号）、新建商品；组件只负责渲染。
function useProductList(currentShopId: string | null) {
  const [list, setList] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setList(null);
    setError("");
    apiRequest<unknown>("GET", `/api/products?shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("商品列表数据异常");
        setList(rows as ProductSummary[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "商品列表加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, reloadCount]);

  async function handleCreate(values: { name: string; category: string; price: string; description: string; skuRule: string }) {
    // creatingRef 同步锁：React 状态更新是异步的，同一瞬间连点两次会都读到 creating=false，必须用 ref 立即占位。
    if (!currentShopId || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await apiRequest<unknown>("POST", `/api/products?shopId=${currentShopId}`, {
        name: values.name.trim(),
        category: values.category.trim() || null,
        price: parseNullableNumber(values.price, "基础价格"),
        description: values.description.trim() || null,
        skuRule: values.skuRule.trim() || null,
      });
      setShowCreate(false);
      setReloadCount((count) => count + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建商品失败");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return { list, error, showCreate, setShowCreate, creating, handleCreate, retry: () => setReloadCount((count) => count + 1) };
}

export default function ProductList() {
  const { currentShopId, shops } = useShops();
  const { list, error, showCreate, setShowCreate, creating, handleCreate, retry } = useProductList(currentShopId);
  const shopName = shops.find((shop) => shop.id === currentShopId)?.name ?? "";

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-3 px-4 py-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商品</h1>
          <p className="mt-1 text-sm text-gray-500">当前店铺：{shopName} · 共 {list?.length ?? 0} 个商品</p>
        </div>
        <button
          onClick={() => setShowCreate((open) => !open)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showCreate ? "收起表单" : "＋ 新建商品"}
        </button>
      </header>
      {showCreate && (
        <CreateProductForm submitting={creating} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      )}
      {list === null && !error && <Loading text="加载商品…" />}
      {error && <ErrorMessage message={error} onRetry={retry} />}
      {list !== null && !error && (
        <>
          {list.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
          {list.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
              还没有商品，点击右上角「新建商品」开始建档。
            </p>
          )}
        </>
      )}
    </div>
  );
}
