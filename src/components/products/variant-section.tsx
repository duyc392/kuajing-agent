// 用途：变体管理区：以表格列出商品全部变体（SKU、颜色/风格、变体价格、库存数量、状态），支持新增、行内编辑、删除。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatPrice, parseNullableInt, parseNullableNumber } from "@/lib/numbers";
import ErrorMessage from "@/components/shared/error-message";
import Loading from "@/components/shared/loading";
import VariantForm from "@/components/products/variant-form";
import type { VariantFormValues } from "@/components/products/variant-form";
import type { VariantView } from "@/types";

// 库存推导的显示状态：>0 在售，=0 售罄，未设置显示提示；数据库中无独立上架状态。
function stockStatus(stock: number | null): { label: string; className: string } | null {
  if (stock === null) return null;
  if (stock > 0) return { label: "在售", className: "bg-green-50 text-green-700" };
  return { label: "售罄", className: "bg-gray-100 text-gray-500" };
}

interface VariantRowProps {
  variant: VariantView;
  basePrice: number | null;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function VariantRow({ variant, basePrice, busy, onEdit, onDelete }: VariantRowProps) {
  const status = stockStatus(variant.stock);
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{variant.sku}</td>
      <td className="px-3 py-2.5 text-sm text-gray-600">{[variant.color, variant.size].filter(Boolean).join(" / ") || "无规格"}</td>
      <td className="px-3 py-2.5 text-sm text-gray-600">
        {variant.price !== null ? `¥${formatPrice(variant.price)}` : basePrice !== null ? `¥${formatPrice(basePrice)}（默认）` : "—"}
      </td>
      <td className="px-3 py-2.5 text-sm text-gray-600">{variant.stock ?? "未设置"}</td>
      <td className="px-3 py-2.5">
        {status ? <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span> : <span className="text-xs text-gray-400">待补充</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex shrink-0 gap-2">
          <button onClick={onEdit} disabled={busy} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            编辑
          </button>
          <button onClick={onDelete} disabled={busy} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
            删除
          </button>
        </div>
      </td>
    </tr>
  );
}

// 变体数据与操作：加载（过期作废 + 取消信号）、新增、更新、删除；所有操作带 busy 锁；lastCountRef 记住最近一次列表长度，供增删成功后回传头部计数。
function useVariants(productId: string, shopId: string) {
  const [variants, setVariants] = useState<VariantView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const busyRef = useRef(false);
  const lastCountRef = useRef(0);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setVariants(null);
    setError("");
    apiRequest<unknown>("GET", `/api/products/${productId}/variants?shopId=${shopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("变体数据异常");
        lastCountRef.current = rows.length;
        setVariants(rows as VariantView[]);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "变体加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, reloadCount]);

  async function run(path: string, method: string, body?: unknown): Promise<boolean> {
    // busyRef 同步锁：同一瞬间连点两次提交会都读到 busy=false，必须用 ref 立即占位防重复请求。
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await apiRequest<unknown>(method, path, body);
      setReloadCount((count) => count + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return {
    variants,
    error,
    setError,
    busy,
    lastCountRef,
    retry: () => setReloadCount((count) => count + 1),
    create: (body: unknown) => run(`/api/products/${productId}/variants?shopId=${shopId}`, "POST", body),
    update: (variantId: string, body: unknown) => run(`/api/products/${productId}/variants/${variantId}?shopId=${shopId}`, "PATCH", body),
    remove: (variantId: string) => run(`/api/products/${productId}/variants/${variantId}?shopId=${shopId}`, "DELETE"),
  };
}

// 表单值 → 提交载荷：空字符串转 null，价格 / 库存转数字（非法输入抛中文错误，由调用方展示）。
function toPayload(values: VariantFormValues) {
  return {
    sku: values.sku.trim(),
    color: values.color.trim() || null,
    size: values.size.trim() || null,
    price: parseNullableNumber(values.price, "价格"),
    stock: parseNullableInt(values.stock, "库存"),
  };
}

interface VariantListProps {
  variants: VariantView[];
  basePrice: number | null;
  editingId: string | null;
  busy: boolean;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (variant: VariantView) => void;
  onSubmitEdit: (values: VariantFormValues) => void;
}

function VariantList({ variants, basePrice, editingId, busy, onEdit, onCancelEdit, onDelete, onSubmitEdit }: VariantListProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--workspace-border)]">
      <table className="w-full border-collapse bg-white text-left">
        <thead>
          <tr className="border-b border-[var(--workspace-border)] bg-[#f0f4f1]">
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">SKU 编码</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">颜色 / 风格</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">变体价格</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">库存数量</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">状态</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">操作</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) =>
            editingId === variant.id ? (
              <tr key={variant.id} className="border-b border-gray-100 last:border-b-0">
                <td colSpan={6} className="p-3">
                  <VariantForm
                    key={variant.id}
                    initial={variant}
                    submitting={busy}
                    submitLabel="保存修改"
                    onSubmit={onSubmitEdit}
                    onCancel={onCancelEdit}
                  />
                </td>
              </tr>
            ) : (
              <VariantRow
                key={variant.id}
                variant={variant}
                basePrice={basePrice}
                busy={busy}
                onEdit={() => onEdit(variant.id)}
                onDelete={() => onDelete(variant)}
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyVariantHint() {
  return (
    <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
      还没有变体。点击下方「＋ 添加变体」，为颜色、尺寸等组合建立 SKU 编码。
    </p>
  );
}

export default function VariantSection({ productId, shopId, basePrice, onVariantsChanged }: { productId: string; shopId: string; basePrice: number | null; onVariantsChanged: (count: number) => void }) {
  const { variants, error, setError, busy, lastCountRef, retry, create, update, remove } = useVariants(productId, shopId);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleSubmit(values: VariantFormValues) {
    let payload: ReturnType<typeof toPayload>;
    // 表单解析（非数字价格等）失败时展示错误横幅，不抛出运行时错误。
    try {
      payload = toPayload(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : "输入不合法，请检查后重试");
      return;
    }
    const isCreate = editingId === null;
    const ok = isCreate ? await create(payload) : await update(editingId, payload);
    if (ok) {
      setShowCreate(false);
      setEditingId(null);
      onVariantsChanged(Math.max(0, lastCountRef.current + (isCreate ? 1 : 0)));
    }
  }

  async function handleDelete(variant: VariantView) {
    if (window.confirm(`确定删除变体 ${variant.sku} 吗？此操作不可恢复。`)) {
      const ok = await remove(variant.id);
      if (ok) onVariantsChanged(Math.max(0, lastCountRef.current - 1));
    }
  }

  if (variants === null && !error) return <Loading text="加载变体…" />;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">SKU 变体</h2>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn btn-outline btn-sm">
            ＋ 添加变体
          </button>
        )}
      </div>
      {error && <ErrorMessage message={error} onRetry={retry} />}
      {variants !== null && (
        <>
          {variants.length === 0 && !showCreate && <EmptyVariantHint />}
          <VariantList
            variants={variants}
            basePrice={basePrice}
            editingId={editingId}
            busy={busy}
            onEdit={setEditingId}
            onCancelEdit={() => setEditingId(null)}
            onDelete={handleDelete}
            onSubmitEdit={handleSubmit}
          />
          {showCreate && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <VariantForm submitting={busy} submitLabel="添加变体" onSubmit={handleSubmit} onCancel={() => setShowCreate(false)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
