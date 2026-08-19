// 用途：变体管理区：列出商品全部变体（SKU、颜色、尺寸、价格、库存），支持新增、行内编辑、删除。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatPrice, parseNullableInt, parseNullableNumber } from "@/lib/numbers";
import ErrorMessage from "@/components/shared/error-message";
import Loading from "@/components/shared/loading";
import VariantForm from "@/components/products/variant-form";
import type { VariantFormValues } from "@/components/products/variant-form";
import type { VariantView } from "@/types";

interface VariantRowProps {
  variant: VariantView;
  basePrice: number | null;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function VariantRow({ variant, basePrice, busy, onEdit, onDelete }: VariantRowProps) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="min-w-0 text-sm">
        <p className="font-medium text-gray-900">{variant.sku}</p>
        <p className="text-xs text-gray-500">
          {[variant.color, variant.size].filter(Boolean).join(" / ") || "无规格"}
          {variant.price !== null ? ` · ¥${formatPrice(variant.price)}` : basePrice !== null ? ` · ¥${formatPrice(basePrice)}（默认）` : ""}
          {variant.stock !== null ? ` · 库存 ${variant.stock}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={onEdit} disabled={busy} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          编辑
        </button>
        <button onClick={onDelete} disabled={busy} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
          删除
        </button>
      </div>
    </li>
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
    <ul className="grid gap-2">
      {variants.map((variant) =>
        editingId === variant.id ? (
          <li key={variant.id}>
            <VariantForm
              key={variant.id}
              initial={variant}
              submitting={busy}
              submitLabel="保存修改"
              onSubmit={onSubmitEdit}
              onCancel={onCancelEdit}
            />
          </li>
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
    </ul>
  );
}

function EmptyVariantHint() {
  return (
    <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
      还没有变体。批量 SKU 生成（颜色 × 尺寸）将在后续版本上线，现在可以先手动添加。
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
          {showCreate ? (
            <VariantForm submitting={busy} submitLabel="添加变体" onSubmit={handleSubmit} onCancel={() => setShowCreate(false)} />
          ) : (
            <div>
              <button onClick={() => setShowCreate(true)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
                ＋ 添加变体
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
