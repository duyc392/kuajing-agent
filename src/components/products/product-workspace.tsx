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
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">{product.name}</h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--workspace-muted)]">
          <span className="status-pill">{product.category ?? "未分类"}</span>
          <span>基础价格 {product.price !== null ? `¥${formatPrice(product.price)}` : "—"}</span>
          <span>· 变体 {variantCount} 款</span>
          <span>· 文案 {product.copies.length} 版</span>
        </p>
        {actionError && <p className="mt-1 text-sm text-red-600">{actionError}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={onEdit} disabled={editing} className="btn btn-outline btn-sm">
          {saving ? "保存中…" : editing ? "编辑中…" : "编辑商品"}
        </button>
        <button onClick={onDelete} disabled={deleting} className="btn btn-sm border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50">
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

// 右侧全景档案：头部摘要 + 标签页（DNA / 基础资料 / SKU / 图片 / 文案）；分区常驻挂载、仅切换显示，避免切页丢编辑态与重复拉取。
const PRODUCT_TABS = [
  { id: "dna", label: "商品 DNA" },
  { id: "info", label: "基础资料" },
  { id: "variants", label: "SKU 变体" },
  { id: "images", label: "图片素材" },
  { id: "copies", label: "文案版本" },
] as const;

// 档案标签页内容：各分区常驻挂载、仅切换显示（hidden），避免切页丢编辑态与重复拉取。
function ProductTabPanels(props: {
  activeTab: (typeof PRODUCT_TABS)[number]["id"];
  product: ProductDetailView;
  shopId: string;
  mutation: ProductMutations;
  onVariantsChanged: (count: number) => void;
}) {
  const { activeTab, product, shopId, mutation, onVariantsChanged } = props;
  return (
    <>
      <div hidden={activeTab !== "dna"}><ProductDnaCard productId={product.id} shopId={shopId} flat /></div>
      <div hidden={activeTab !== "info"}>
        <ProductInfoPanel
          product={product}
          saving={mutation.saving}
          editing={mutation.editing}
          onSave={(values) => void mutation.handleSave(values)}
          onCancelEdit={() => mutation.setEditing(false)}
          flat
        />
      </div>
      <div hidden={activeTab !== "variants"}>
        <VariantSection productId={product.id} shopId={shopId} basePrice={product.price} onVariantsChanged={onVariantsChanged} />
      </div>
      <div hidden={activeTab !== "images"}><ProductImages productId={product.id} shopId={shopId} flat /></div>
      <div hidden={activeTab !== "copies"}><CopyHistory productId={product.id} shopId={shopId} copies={product.copies} flat /></div>
    </>
  );
}

function ProductMainArea(props: {
  product: ProductDetailView;
  shopId: string;
  mutation: ProductMutations;
  onDeleted: () => void;
}) {
  const { product, shopId, mutation, onDeleted } = props;
  const [variantCount, setVariantCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof PRODUCT_TABS)[number]["id"]>("dna");

  return (
    <div className="page-card grid gap-5 p-5 sm:p-6">
      <WorkspaceHeader
        product={product}
        variantCount={variantCount ?? product.variants.length}
        editing={mutation.editing}
        saving={mutation.saving}
        deleting={mutation.deleting}
        actionError={mutation.actionError}
        onEdit={() => {
          mutation.setEditing(true);
          setActiveTab("info");
        }}
        onDelete={() =>
          void mutation.handleDelete().then((deleted) => {
            if (deleted) onDeleted();
          })
        }
      />
      <nav className="subnav border-b border-[var(--workspace-border)] pb-3" aria-label="商品档案分区">
        {PRODUCT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={activeTab === tab.id ? "page" : undefined}
            className="subnav-link"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <ProductTabPanels activeTab={activeTab} product={product} shopId={shopId} mutation={mutation} onVariantsChanged={setVariantCount} />
      <p className="page-note !mt-0 border-t border-[var(--workspace-border)] pt-4">
        <span>创作文案和脚本时，将使用这份商品资料。</span>
      </p>
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
        <p className="page-card border-dashed p-8 text-center text-sm text-[var(--workspace-muted)]">
          还没有商品，点击右上角「新建商品」开始建档。
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

// 工作区写操作组合：编辑态 + 保存/删除/创建三个动作与列表、详情刷新的联动，产出档案区所需的 mutation 契约。
function useProductMutations(params: {
  currentShopId: string | null;
  selectedId: string | null;
  product: ProductDetailView | null;
  refreshDetail: () => void;
  refreshList: () => void;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const { currentShopId, selectedId, product, refreshDetail, refreshList, onCreated, onDeleted } = params;
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
      refreshList();
    },
  });
  const del = useDeleteProduct({
    currentShopId,
    selectedId,
    product,
    setActionError,
    onDeleted: () => {
      setEditing(false);
      refreshList();
    },
  });
  const create = useCreateProduct(currentShopId, onCreated);
  const mutation: ProductMutations = {
    editing,
    setEditing,
    saving: save.saving,
    deleting: del.deleting,
    actionError,
    handleSave: save.handleSave,
    handleDelete: del.handleDelete,
  };
  return { editing, setEditing, mutation, create };
}

export default function ProductWorkspace() {
  const { currentShopId } = useShops();
  const [refreshingList, setRefreshingList] = useState(0);
  const { list, error: listError, retry: retryList } = useProducts(currentShopId, refreshingList);
  const { selectedId, setSelectedId } = useSelection(list);
  const { product, error: detailError, refresh: refreshDetail } = useProductDetail(selectedId, currentShopId);
  const { editing, setEditing, mutation, create } = useProductMutations({
    currentShopId,
    selectedId,
    product,
    refreshDetail,
    refreshList: () => setRefreshingList((count) => count + 1),
    onCreated: (id) => {
      setRefreshingList((count) => count + 1);
      setSelectedId(id);
    },
    onDeleted: () => setSelectedId(null),
  });

  // 切换商品前拦截编辑态：未保存的修改会随档案区（按商品 id 重建）丢失，确认后再切换并退出编辑。
  function selectProduct(id: string) {
    if (editing && id !== selectedId) {
      if (!window.confirm("正在编辑商品资料，切换后将丢失未保存的修改。确定切换吗？")) return;
      setEditing(false);
    }
    setSelectedId(id);
  }

  // 编辑态关闭/刷新页面前提示（SPA 内切换由 selectProduct 拦截）。
  useEffect(() => {
    if (!editing) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editing]);

  if (!currentShopId) {
    return <p className="p-10 text-center text-sm text-[var(--workspace-muted)]">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1 className="page-title">商品</h1>
          <p className="page-subtitle">统一商品资料，让每次创作都有据可依。</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => create.setShowCreate(!create.showCreate)} className="btn btn-primary">
            <span className="text-base leading-none">＋</span>新建商品
          </button>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <ProductSidebar
          products={list}
          selectedId={selectedId}
          onSelect={selectProduct}
          error={listError}
          onRetry={retryList}
          showCreate={create.showCreate}
          setShowCreate={create.setShowCreate}
          submitting={create.creating}
          onSubmit={(values) => void create.handleCreate(values)}
          createError={create.createError}
          onDismissCreateError={create.clearError}
        />
        <main className="grid min-w-0 gap-4">
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
            onDeleted={() => setSelectedId(null)}
          />
        </main>
      </div>
    </div>
  );
}
