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
    <aside className="page-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">商品列表</p>
        {products !== null && <span className="status-pill">{products.length} 个商品</span>}
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
                className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                  selectedId === product.id
                    ? "bg-[var(--workspace-soft)] ring-1 ring-[#9ecdb9]"
                    : "hover:bg-[#f0f5f1]"
                }`}
              >
                <p className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{product.name}</span>
                    {product.testingStatus === "testing" && (
                      <span className="status-pill shrink-0 !px-1.5 !py-0.5 text-[10px] leading-none" data-tone="warn">测品中</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[13px] text-[var(--workspace-muted)]">{product.price !== null ? `¥${formatPrice(product.price)}` : "—"}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--workspace-muted)]">
                  {product.category ?? "未分类"} · 文案 {product.copyCount} 版 · 变体 {product.variantCount}
                  <span className={`ml-1 ${product.dnaBuilt ? "font-medium text-[#2e6350]" : ""}`}>· {product.dnaBuilt ? "DNA 已建" : "DNA 未建"}</span>
                </p>
              </button>
            </li>
          ))}
          {products.length === 0 && (
            <li className="rounded-xl border border-dashed border-[var(--workspace-border)] p-6 text-center text-sm text-[var(--workspace-muted)]">
              还没有商品，点右上角「新建商品」建档。
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}
