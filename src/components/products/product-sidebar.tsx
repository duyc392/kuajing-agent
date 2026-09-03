// 用途：商品工作区左侧栏：当前店铺商品列表（点选联动右侧）+ 新建商品表单入口 + 加载/错误/空态引导。
"use client";

import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import CreateProductForm from "@/components/products/product-create-form";
import type { ProductInfoValues } from "@/components/products/product-info-panel";
import { formatPrice } from "@/lib/numbers";
import type { ProductSummary } from "@/types";

interface ProductSidebarProps {
  products: ProductSummary[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  error: string;
  onRetry: () => void;
  showCreate: boolean;
  setShowCreate: (open: boolean) => void;
  submitting: boolean;
  onSubmit: (values: ProductInfoValues) => void;
  createError: string;
  onDismissCreateError: () => void;
}

export default function ProductSidebar({
  products, selectedId, onSelect, error, onRetry,
  showCreate, setShowCreate, submitting, onSubmit, createError, onDismissCreateError,
}: ProductSidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">商品</p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          {showCreate ? "收起表单" : "＋ 新建"}
        </button>
      </div>
      {createError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5">
          <p className="text-xs text-red-700">{createError}</p>
          <button onClick={onDismissCreateError} className="mt-1 text-xs text-red-600 underline hover:text-red-700">
            知道了
          </button>
        </div>
      )}
      {showCreate && <CreateProductForm submitting={submitting} onSubmit={onSubmit} onCancel={() => setShowCreate(false)} />}
      {products === null && !error && <Loading text="加载商品…" />}
      {error && <ErrorMessage message={error} onRetry={onRetry} />}
      {products !== null && !error && (
        <ul className="grid gap-1.5">
          {products.map((product) => (
            <li key={product.id}>
              <button
                onClick={() => onSelect(product.id)}
                className={`w-full rounded-lg px-3 py-2 text-left ${selectedId === product.id ? "bg-blue-50 ring-1 ring-blue-300" : "bg-white hover:bg-gray-100"}`}
              >
                <p className="flex items-center justify-between gap-2 text-sm font-medium text-gray-900">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{product.name}</span>
                    {product.testingStatus === "testing" && (
                      <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">🟡 测品中</span>
                    )}
                  </span>
                  <span className="shrink-0 text-blue-600">{product.price !== null ? `¥${formatPrice(product.price)}` : "—"}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {product.category ?? "未分类"} · 文案 {product.copyCount} 版 · 变体 {product.variantCount}
                  <span className={`ml-1 ${product.dnaBuilt ? "font-medium text-green-600" : "text-gray-400"}`}>· {product.dnaBuilt ? "DNA已建" : "DNA未建"}</span>
                </p>
              </button>
            </li>
          ))}
          {products.length === 0 && (
            <li className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
              还没有商品，点右上角「新建」建档。
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}
