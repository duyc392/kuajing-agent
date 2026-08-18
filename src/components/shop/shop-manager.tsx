// 用途：店铺管理页主体：列表展示（当前标记、商品数）、切换当前店铺、行内编辑、归档 / 恢复、新建入口。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { ShopFields } from "@/components/shop/shop-fields";
import type { ShopFieldsValue } from "@/components/shop/shop-fields";
import type { ShopOverview } from "@/types";

function toFields(shop: ShopOverview): ShopFieldsValue {
  return { name: shop.name, market: shop.market, description: shop.description ?? "" };
}

function ShopInfo({ shop, isCurrent }: { shop: ShopOverview; isCurrent: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{shop.name}</h2>
        {isCurrent && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">当前店铺</span>}
        {shop.archived && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">已归档</span>}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {shop.market} · {shop.productCount} 个商品 · 创建于 {new Date(shop.createdAt).toLocaleDateString("zh-CN")}
      </p>
      {shop.description && <p className="mt-2 text-sm text-gray-600">{shop.description}</p>}
    </div>
  );
}

interface ShopActionsProps {
  shop: ShopOverview;
  isCurrent: boolean;
  busy: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
}

function ShopActions({ shop, isCurrent, busy, onSwitch, onEdit, onToggleArchive }: ShopActionsProps) {
  const buttonClass = "rounded-lg border px-3 py-1.5 text-sm";
  return (
    <div className="flex shrink-0 flex-col gap-2">
      {!isCurrent && !shop.archived && (
        <button type="button" onClick={onSwitch} className={`${buttonClass} border-blue-300 text-blue-700 hover:bg-blue-50`}>
          设为当前
        </button>
      )}
      <button type="button" onClick={onEdit} className={`${buttonClass} border-gray-300 text-gray-700 hover:bg-gray-50`}>
        编辑
      </button>
      <button
        type="button"
        onClick={onToggleArchive}
        disabled={busy}
        className={`${buttonClass} border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50`}
      >
        {shop.archived ? "恢复" : "归档"}
      </button>
    </div>
  );
}

interface ShopEditFormProps {
  shop: ShopOverview;
  onDone: () => Promise<void>;
}

function ShopEditForm({ shop, onDone }: ShopEditFormProps) {
  const [draft, setDraft] = useState<ShopFieldsValue>(toFields(shop));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (draft.name.trim() === "") {
      setError("店铺名称不能为空");
      return;
    }
    if (draft.market === "") {
      setError("请选择所属市场");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest("PATCH", `/api/shops/${shop.id}`, {
        name: draft.name.trim(),
        market: draft.market,
        description: draft.description.trim() === "" ? null : draft.description.trim(),
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <ShopFields value={draft} onChange={setDraft} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "保存中…" : "保存修改"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50">
          取消
        </button>
      </div>
    </div>
  );
}

interface ShopCardProps {
  shop: ShopOverview;
  isCurrent: boolean;
  onSwitch: (id: string) => void;
  onReload: () => Promise<void>;
}

function ShopCard({ shop, isCurrent, onSwitch, onReload }: ShopCardProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleArchive() {
    const archiving = !shop.archived;
    const message = archiving
      ? `确定归档「${shop.name}」吗？归档后不再出现在切换列表，数据保留可恢复。`
      : `确定恢复「${shop.name}」吗？`;
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(archiving ? "DELETE" : "PATCH", `/api/shops/${shop.id}`, archiving ? undefined : { archived: false });
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        isCurrent && !shop.archived ? "border-blue-400 ring-1 ring-blue-300" : "border-gray-200"
      } ${shop.archived ? "opacity-70" : ""}`}
    >
      {editing ? (
        <ShopEditForm shop={shop} onDone={async () => { setEditing(false); await onReload(); }} />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <ShopInfo shop={shop} isCurrent={isCurrent} />
          <ShopActions
            shop={shop}
            isCurrent={isCurrent}
            busy={busy}
            onSwitch={() => onSwitch(shop.id)}
            onEdit={() => setEditing(true)}
            onToggleArchive={toggleArchive}
          />
        </div>
      )}
      {error && !editing && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

interface ShopToolbarProps {
  total: number;
  archivedCount: number;
  showArchived: boolean;
  currentName: string;
  onToggleArchived: () => void;
}

function ShopToolbar({ total, archivedCount, showArchived, currentName, onToggleArchived }: ShopToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-500">共 {total} 家店铺 · 当前：{currentName}</p>
      <div className="flex items-center gap-3 text-sm">
        {archivedCount > 0 && (
          <button type="button" onClick={onToggleArchived} className="text-gray-600 underline">
            {showArchived ? "隐藏归档店铺" : `显示归档店铺（${archivedCount}）`}
          </button>
        )}
        <Link href="/create-shop" className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
          ＋ 新建店铺
        </Link>
      </div>
    </div>
  );
}

interface ShopListViewProps {
  shops: ShopOverview[];
  currentShopId: string | null;
  onSwitch: (id: string) => void;
  onReload: () => Promise<void>;
}

function ShopListView({ shops, currentShopId, onSwitch, onReload }: ShopListViewProps) {
  return (
    <>
      {shops.map((shop) => (
        <ShopCard key={shop.id} shop={shop} isCurrent={shop.id === currentShopId} onSwitch={onSwitch} onReload={onReload} />
      ))}
      {shops.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          还没有店铺，点击右上角「新建店铺」开始。
        </p>
      )}
    </>
  );
}

export default function ShopManager() {
  const { currentShopId, setCurrentShopId, refresh } = useShops();
  const [list, setList] = useState<ShopOverview[] | null>(null);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  async function reload() {
    try {
      setList(await apiRequest<ShopOverview[]>("GET", "/api/shops?includeArchived=true"));
      await refresh();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "店铺列表加载失败");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (list === null) {
    return error ? <ErrorMessage message={error} onRetry={() => void reload()} /> : <Loading text="正在加载店铺…" />;
  }

  const archivedCount = list.filter((shop) => shop.archived).length;
  const visible = showArchived ? list : list.filter((shop) => !shop.archived);
  const currentName = list.find((shop) => shop.id === currentShopId)?.name ?? "未选择";

  return (
    <div className="grid gap-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <ShopToolbar total={list.length} archivedCount={archivedCount} showArchived={showArchived} currentName={currentName} onToggleArchived={() => setShowArchived(!showArchived)} />
      <ShopListView shops={visible} currentShopId={currentShopId} onSwitch={setCurrentShopId} onReload={reload} />
    </div>
  );
}
