// 用途：商品详情：展示商品字段、编辑表单、删除入口；标签页切换 详情 / 变体管理 / 文案历史 / 图片。
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { formatPrice, parseNullableNumber } from "@/lib/numbers";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import VariantSection from "@/components/products/variant-section";
import CopyHistory from "@/components/products/copy-history";
import ProductImages from "@/components/products/product-images";
import type { ProductDetailView } from "@/types";

type TabKey = "info" | "variants" | "copies" | "images";

function DetailTabs({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "info", label: "详情" },
    { key: "variants", label: "变体" },
    { key: "copies", label: "文案历史" },
    { key: "images", label: "图片" },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 text-sm ${active === tab.key ? "border-b-2 border-blue-600 font-medium text-blue-600" : "text-gray-500 hover:text-gray-800"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function ActionButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onEdit} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">编辑</button>
      <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">删除</button>
    </div>
  );
}

interface EditFormProps {
  product: ProductDetailView;
  submitting: boolean;
  onSubmit: (values: { name: string; category: string; price: string; description: string; skuRule: string }) => void;
  onCancel: () => void;
}

function EditForm({ product, submitting, onSubmit, onCancel }: EditFormProps) {
  const [values, setValues] = useState({
    name: product.name,
    category: product.category ?? "",
    price: product.price !== null ? product.price.toFixed(2) : "",
    description: product.description ?? "",
    skuRule: product.skuRule ?? "",
  });
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <label className="grid gap-1 text-xs text-gray-600">
        名称（必填）
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.name} onChange={set("name")} maxLength={200} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        类目
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.category} onChange={set("category")} maxLength={100} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        基础价格
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.price} onChange={set("price")} placeholder="数字，可留空" />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        商品描述
        <textarea className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" rows={4} value={values.description} onChange={set("description")} maxLength={5000} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        SKU 编码规则（Agent 建议）
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.skuRule} onChange={set("skuRule")} maxLength={500} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting || values.name.trim() === ""} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "保存中…" : "保存修改"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          取消
        </button>
      </div>
    </form>
  );
}

// 详情页数据加载：店铺或商品变化时重新拉取，过期作废 + 取消信号。
function useProductDetail(productId: string, currentShopId: string | null) {
  const [product, setProduct] = useState<ProductDetailView | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setProduct(null);
    setError("");
    apiRequest<unknown>("GET", `/api/products/${productId}?shopId=${currentShopId}`, undefined, controller.signal)
      .then((row) => { if (!stale) setProduct(row as ProductDetailView); })
      .catch((e: Error) => { if (!stale) setError(e.message || "商品加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, currentShopId, reloadCount]);

  return { product, error, setError, refresh: () => setReloadCount((count) => count + 1) };
}

function ProductHeader({ product, variantCount }: { product: ProductDetailView; variantCount: number }) {
  return (
    <header>
      <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {product.category ?? "未分类"} · 基础价格 {product.price !== null ? `¥${formatPrice(product.price)}` : "—"} · 变体 {variantCount} · 文案 {product.copies.length} 版
      </p>
    </header>
  );
}

interface InfoTabProps {
  product: ProductDetailView;
  editing: boolean;
  saving: boolean;
  onSave: EditFormProps["onSubmit"];
  onCancelEdit: () => void;
}

function InfoTab({ product, editing, saving, onSave, onCancelEdit }: InfoTabProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {editing ? (
        <EditForm product={product} submitting={saving} onSubmit={onSave} onCancel={onCancelEdit} />
      ) : (
        <div className="grid gap-4">
          <Field label="商品描述" value={product.description ?? "（未填写）"} />
          <Field label="SKU 编码规则（Agent 建议）" value={product.skuRule ?? "（未设置）"} />
        </div>
      )}
    </div>
  );
}

// 详情页写操作：保存（PATCH）与删除（DELETE），独立管理编辑态 / 保存中 / 操作错误；ref 同步锁防连点重复请求。
function useProductActions(productId: string, shopId: string, product: ProductDetailView, onChanged: () => void) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const savingRef = useRef(false);
  const deletingRef = useRef(false);

  async function handleSave(values: { name: string; category: string; price: string; description: string; skuRule: string }) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await apiRequest<unknown>("PATCH", `/api/products/${productId}?shopId=${shopId}`, {
        name: values.name.trim(),
        category: values.category.trim() || null,
        price: parseNullableNumber(values.price, "基础价格"),
        description: values.description.trim() || null,
        skuRule: values.skuRule.trim() || null,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deletingRef.current) return;
    if (!window.confirm(`确定删除商品「${product.name}」吗？其变体与文案将一并删除，此操作不可恢复；已生成的视频脚本会解除商品关联并保留在脚本页。`)) return;
    deletingRef.current = true;
    try {
      await apiRequest<unknown>("DELETE", `/api/products/${productId}?shopId=${shopId}`);
      router.push("/products");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败，请重试");
    } finally {
      deletingRef.current = false;
    }
  }

  return { editing, saving, actionError, handleSave, handleDelete, startEdit: () => setEditing(true), cancelEdit: () => setEditing(false) };
}

interface BodyProps {
  productId: string;
  shopId: string;
  product: ProductDetailView;
  error: string;
  onRetry: () => void;
  onChanged: () => void;
}

function ProductDetailBody({ productId, shopId, product, error, onRetry, onChanged }: BodyProps) {
  const [tab, setTab] = useState<TabKey>("info");
  // 变体数量覆盖值：增删变体后由 VariantSection 回传最新数量，只更新头部计数，不整页刷新（保留当前标签页）。
  const [variantCount, setVariantCount] = useState<number | null>(null);
  const { editing, saving, actionError, handleSave, handleDelete, startEdit, cancelEdit } = useProductActions(productId, shopId, product, onChanged);
  const visibleError = error || actionError;

  return (
    <>
      <div className="flex items-center justify-between">
        <Link href="/products" className="text-sm text-blue-600 hover:underline">← 返回商品列表</Link>
        <ActionButtons onEdit={startEdit} onDelete={handleDelete} />
      </div>
      {visibleError && <ErrorMessage message={visibleError} onRetry={onRetry} />}
      <ProductHeader product={product} variantCount={variantCount ?? product.variants.length} />
      <DetailTabs active={tab} onChange={setTab} />
      {tab === "info" && <InfoTab product={product} editing={editing} saving={saving} onSave={handleSave} onCancelEdit={cancelEdit} />}
      {tab === "variants" && (
        <VariantSection productId={productId} shopId={shopId} basePrice={product.price} onVariantsChanged={setVariantCount} />
      )}
      {tab === "copies" && <CopyHistory productId={productId} shopId={shopId} copies={product.copies} />}
      {tab === "images" && <ProductImages productId={productId} shopId={shopId} />}
    </>
  );
}

export default function ProductDetail({ productId }: { productId: string }) {
  const { currentShopId } = useShops();
  const { product, error, refresh } = useProductDetail(productId, currentShopId);

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }
  if (product === null && !error) return <Loading text="加载商品…" />;
  // 加载失败（含商品不存在 / 跨店铺 404）：渲染错误提示与重试，主内容区不空白。
  if (product === null) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
        <ErrorMessage message={error} onRetry={refresh} />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
      <ProductDetailBody
        key={product.id}
        productId={productId}
        shopId={currentShopId}
        product={product}
        error={error}
        onRetry={refresh}
        onChanged={refresh}
      />
    </div>
  );
}
