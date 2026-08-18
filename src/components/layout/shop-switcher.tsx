// 用途：店铺切换器（工作台顶栏）：下拉展示所有店铺，点击切换"当前店铺"，并提供新建与管理入口。
"use client";

import { useState } from "react";
import Link from "next/link";
import { useShops } from "@/components/shop/shop-context";
import type { ShopOverview } from "@/types";

interface ShopOptionProps {
  shop: ShopOverview;
  active: boolean;
  onPick: (id: string) => void;
}

function ShopOption({ shop, active, onPick }: ShopOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(shop.id)}
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
    >
      <span className="block font-medium text-gray-900">{active ? "✓ " : ""}{shop.name}</span>
      <span className="block text-xs text-gray-500">{shop.market} · {shop.productCount} 个商品</span>
    </button>
  );
}

export default function ShopSwitcher() {
  const { shops, currentShopId, setCurrentShopId, loading, error } = useShops();
  const [open, setOpen] = useState(false);
  const current = shops.find((shop) => shop.id === currentShopId) ?? null;

  function pick(id: string) {
    setCurrentShopId(id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        <span className="font-medium text-gray-900">
          {error ? "加载失败" : current ? current.name : loading ? "加载中…" : "尚无店铺"}
        </span>
        {current && <span className="text-xs text-gray-500">{current.market}</span>}
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="max-h-72 overflow-y-auto py-1">
              {shops.map((shop) => (
                <ShopOption key={shop.id} shop={shop} active={shop.id === currentShopId} onPick={pick} />
              ))}
              {shops.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">还没有店铺</p>}
            </div>
            <div className="border-t border-gray-100">
              <Link href="/create-shop" className="block px-3 py-2 text-sm text-blue-600 hover:bg-gray-50">＋ 新建店铺</Link>
              <Link href="/settings/shops" className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">管理店铺（编辑 / 归档）</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
