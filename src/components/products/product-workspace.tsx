// 用途：商品工作区（/products）：左侧商品列表（选择联动、新建、删除） + 右侧全景档案（DNA / 基础信息 / SKU 变体 / 文案版本 / 商品图片一页平铺）；
// 选中商品同步进 URL（?productId=），切换店铺自动清空重选，所有请求带过期作废 + 取消信号，旧请求不会覆盖新商品。
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { formatPrice, parseNullableNumber } from "@/lib/numbers";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import ProductSidebar from "@/components/products/product-sidebar";
import ProductInfoPanel, { type ProductInfoValues } from "@/components/products/product-info-panel";
import ProductDnaCard from "@/components/products/product-dna-card";
import VariantSection from "@/components/products/variant-section";
import CopyHistory from "@/components/products/copy-history";
import ProductImages from "@/components/products/product-images";
import type { ProductDetailView, ProductSummary } from "@/types";

// 商品列表加载：店铺/重载变化时重新拉取，过期请求作废 + 取消信号（竞态防护：旧店铺请求不能覆盖新店铺列表）。
function useProducts(currentShopId: string | null, refreshKey: number) {
  const [list, setList] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

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
      .catch((e: Error) => {
        if (!stale) setError(e.message || "商品列表加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, reloadCount, refreshKey]);

  return { list, error, retry: () => setReloadCount((count) => count + 1) };
}

// 商品详情加载：选中商品或店铺变化时重新拉取，过期请求作废 + 取消信号。
function useProductDetail(productId: string | null, shopId: string | null) {
  const [product, setProduct] = useState<ProductDetailView | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!productId || !shopId) {
      setProduct(null);
      setError("");
      return;
    }
    let stale = false;
    const controller = new AbortController();
    setProduct(null);
    setError("");
    apiRequest<unknown>("GET", `/api/products/${productId}?shopId=${shopId}`, undefined, controller.signal)
      .then((row) => {
        if (!stale) setProduct(row as ProductDetailView);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "商品加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, reloadCount]);

  return { product, error, refresh: () => setReloadCount((count) => count + 1) };
}

// 选中商品与 URL 同步：列表加载后校准选中值（保留旧选中 → URL 参数 → 列表第一项），选中变化写回 ?productId=。
function useSelection(list: ProductSummary[] | null) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (list === null) return;
    setSelectedId((prev) => {
      if (prev && list.some((item) => item.id === prev)) return prev;
      const param = searchParams.get("productId");
      if (param && list.some((item) => item.id === param)) return param;
      return list[0]?.id ?? null;
    });
  }, [list, searchParams]);

  useEffect(() => {
    if (selectedId) router.replace(`/products?productId=${selectedId}`, { scroll: false });
  }, [selectedId, router]);

  return { selectedId, setSelectedId };
}

// 商品信息保存动作：ref 同步锁防连点；成功后清掉历史错误并刷新详情与列表。
function useSaveProduct(params: {
  currentShopId: string | null;
  selectedId: string | null;
  setActionError: (message: string) => void;
  onSaved: () => void;
}) {
  const { currentShopId, selectedId, setActionError, onSaved } = params;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function handleSave(values: ProductInfoValues): Promise<boolean> {
    if (!currentShopId || !selectedId || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await apiRequest<unknown>("PATCH", `/api/products/${selectedId}?shopId=${currentShopId}`, {
        name: values.name.trim(),
        category: values.category.trim() || null,
        price: parseNullableNumber(values.price, "基础价格"),
        description: values.description.trim() || null,
        skuRule: values.skuRule.trim() || null,
      });
      setActionError("");
      onSaved();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "保存失败，请重试");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return { saving, handleSave };
}

// 商品删除动作：ref 同步锁防连点；成功后清掉历史错误并刷新列表。
function useDeleteProduct(params: {
  currentShopId: string | null;
  selectedId: string | null;
  product: ProductDetailView | null;
  setActionError: (message: string) => void;
  onDeleted: () => void;
}) {
  const { currentShopId, selectedId, product, setActionError, onDeleted } = params;
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  async function handleDelete(): Promise<boolean> {
    if (!currentShopId || !selectedId || !product || deletingRef.current) return false;
    if (!window.confirm(`确定删除商品「${product.name}」吗？其变体、文案、视频脚本与内容运营数据将一并删除，此操作不可恢复。`)) return false;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await apiRequest<unknown>("DELETE", `/api/products/${selectedId}?shopId=${currentShopId}`);
      setActionError("");
      onDeleted();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败，请重试");
      return false;
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return { deleting, handleDelete };
}

// 新建商品动作：ref 同步锁防连点；成功后关闭表单、清错误并回调选中新商品。
function useCreateProduct(currentShopId: string | null, onCreated: (id: string) => void) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const creatingRef = useRef(false);

  async function handleCreate(values: ProductInfoValues): Promise<void> {
    if (!currentShopId || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const created = await apiRequest<{ id: string }>("POST", `/api/products?shopId=${currentShopId}`, {
        name: values.name.trim(),
        category: values.category.trim() || null,
        price: parseNullableNumber(values.price, "基础价格"),
        description: values.description.trim() || null,
        skuRule: values.skuRule.trim() || null,
      });
      setShowCreate(false);
      setCreateError("");
      onCreated(created.id);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "创建商品失败");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return { showCreate, setShowCreate, creating, createError, clearError: () => setCreateError(""), handleCreate };
}

function WorkspaceHeader({ product, variantCount, editing, saving, deleting, actionError, onEdit, onDelete }: {
  product: ProductDetailView;
  variantCount: number;
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  actionError: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{product.name} · 商品全景档案</h1>
        <p className="mt-1 text-sm text-gray-500">
          {product.category ?? "未分类"} · 基础价格 {product.price !== null ? `¥${formatPrice(product.price)}` : "—"} · 变体 {variantCount} · 文案 {product.copies.length} 版
        </p>
        {actionError && <p className="mt-1 text-sm text-red-600">{actionError}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={onEdit} disabled={editing} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50">
          {saving ? "保存中…" : editing ? "编辑中…" : "编辑商品"}
        </button>
        <button onClick={onDelete} disabled={deleting} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
          {deleting ? "删除中…" : "删除"}
        </button>
      </div>
    </div>
  );
}

// 右侧全景档案的操作契约：编辑态与两个动作由工作区装配后传入，内容面板不做请求。
interface ProductMutations {
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  actionError: string;
  setEditing: (editing: boolean) => void;
  handleSave: (values: ProductInfoValues) => Promise<boolean>;
  handleDelete: () => Promise<boolean>;
}

// 右侧全景档案：头部信息 + 一页平铺的档案区块（DNA / 基础信息 / SKU 变体 / 图片与文案双栏）。
function ProductMainArea(props: {
  product: ProductDetailView;
  shopId: string;
  mutation: ProductMutations;
  onDeleted: () => void;
}) {
  const { product, shopId, mutation, onDeleted } = props;
  const [variantCount, setVariantCount] = useState<number | null>(null);

  return (
    <div className="grid gap-6">
      <WorkspaceHeader
        product={product}
        variantCount={variantCount ?? product.variants.length}
        editing={mutation.editing}
        saving={mutation.saving}
        deleting={mutation.deleting}
        actionError={mutation.actionError}
        onEdit={() => mutation.setEditing(true)}
        onDelete={() =>
          void mutation.handleDelete().then((deleted) => {
            if (deleted) onDeleted();
          })
        }
      />
      <ProductInfoPanel
        product={product}
        saving={mutation.saving}
        editing={mutation.editing}
        onSave={(values) => void mutation.handleSave(values)}
        onCancelEdit={() => mutation.setEditing(false)}
      />
      <ProductDnaCard productId={product.id} shopId={shopId} />
      <VariantSection productId={product.id} shopId={shopId} basePrice={product.price} onVariantsChanged={setVariantCount} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProductImages productId={product.id} shopId={shopId} />
        <CopyHistory productId={product.id} shopId={shopId} copies={product.copies} />
      </div>
    </div>
  );
}

// 右侧主面板：按加载/错误/空列表/已选中四态渲染对应内容，状态全部来自工作区。
function ProductPane(props: {
  list: ProductSummary[] | null;
  listError: string;
  retryList: () => void;
  selectedId: string | null;
  detailError: string;
  refreshDetail: () => void;
  product: ProductDetailView | null;
  shopId: string;
  mutation: ProductMutations;
  onDeleted: () => void;
}) {
  const { list, listError, retryList, selectedId, detailError, refreshDetail, product } = props;
  return (
    <>
      {(selectedId !== null || list === null) && product === null && !detailError && !listError && (
        <Loading text="加载商品…" />
      )}
      {product === null && detailError !== "" && selectedId !== null && (
        <ErrorMessage message={detailError} onRetry={refreshDetail} />
      )}
      {list !== null && list.length === 0 && selectedId === null && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          还没有商品，点击左侧「＋ 新建」开始建档。
        </p>
      )}
      {product !== null && selectedId !== null && (
        <ProductMainArea
          key={product.id}
          product={product}
          shopId={props.shopId}
          mutation={props.mutation}
          onDeleted={props.onDeleted}
        />
      )}
    </>
  );
}

export default function ProductWorkspace() {
  const { currentShopId, shops } = useShops();
  const [refreshingList, setRefreshingList] = useState(0);
  const { list, error: listError, retry: retryList } = useProducts(currentShopId, refreshingList);
  const { selectedId, setSelectedId } = useSelection(list);
  const { product, error: detailError, refresh: refreshDetail } = useProductDetail(selectedId, currentShopId);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState("");
  const save = useSaveProduct({
    currentShopId,
    selectedId,
    setActionError,
    onSaved: () => {
      setEditing(false);
      setActionError("");
      refreshDetail();
      setRefreshingList((count) => count + 1);
    },
  });
  const del = useDeleteProduct({
    currentShopId,
    selectedId,
    product,
    setActionError,
    onDeleted: () => {
      setEditing(false);
      setRefreshingList((count) => count + 1);
    },
  });
  const mutation: ProductMutations = {
    editing,
    setEditing,
    saving: save.saving,
    deleting: del.deleting,
    actionError,
    handleSave: save.handleSave,
    handleDelete: del.handleDelete,
  };
  const create = useCreateProduct(currentShopId, (id) => {
    setRefreshingList((count) => count + 1);
    setSelectedId(id);
  });
  const shopName = shops.find((shop) => shop.id === currentShopId)?.name ?? "";

  // 删除当前商品：立即清空选中与详情区，列表刷新后自动落回剩余第一项。
  function handleDeleted() {
    setSelectedId(null);
  }

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ProductSidebar
        products={list}
        selectedId={selectedId}
        onSelect={setSelectedId}
        error={listError}
        onRetry={retryList}
        showCreate={create.showCreate}
        setShowCreate={create.setShowCreate}
        submitting={create.creating}
        onSubmit={(values) => void create.handleCreate(values)}
        createError={create.createError}
        onDismissCreateError={create.clearError}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6">
        <p className="text-sm text-gray-500">当前店铺：{shopName}</p>
        <ProductPane
          list={list}
          listError={listError}
          retryList={retryList}
          selectedId={selectedId}
          detailError={detailError}
          refreshDetail={refreshDetail}
          product={product}
          shopId={currentShopId}
          mutation={mutation}
          onDeleted={handleDeleted}
        />
      </main>
    </div>
  );
}
