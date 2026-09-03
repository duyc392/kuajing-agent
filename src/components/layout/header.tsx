// 用途：顶部导航栏：六个主页面互跳链接（含选品调研与测品中数量徽标）与店铺切换器，全站页面共用。
// 测品数量 = 当前店铺 Product.testingStatus === "testing" 的商品数，选品沙盒推进成功后经事件即时刷新。
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ShopSwitcher from "@/components/layout/shop-switcher";
import { useShops } from "@/components/shop/shop-context";
import { apiRequest } from "@/lib/api-client";
import { SELECTION_POOL_CHANGED_EVENT } from "@/components/selection/selection-context";
import type { ProductSummary } from "@/types";

const NAV_ITEMS = [
  { href: "/workspace", label: "工作台" },
  { href: "/selection", label: "选品调研" },
  { href: "/products", label: "商品" },
  { href: "/content", label: "内容创作" },
  { href: "/dashboard", label: "数据看板" },
  { href: "/settings", label: "设置" },
];

function useTestingCount(shopId: string | null) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (shopId === null) return;
    let stale = false;
    apiRequest<ProductSummary[]>("GET", `/api/products?shopId=${encodeURIComponent(shopId)}`)
      .then((products) => {
        if (!stale) setCount(products.filter((product) => product.testingStatus === "testing").length);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [shopId]);

  useEffect(() => {
    const stop = refresh();
    window.addEventListener(SELECTION_POOL_CHANGED_EVENT, refresh);
    return () => {
      stop?.();
      window.removeEventListener(SELECTION_POOL_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return count;
}

export default function Header() {
  const pathname = usePathname();
  const { currentShopId } = useShops();
  const testingCount = useTestingCount(currentShopId);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-2.5">
      <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4">
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  active ? "bg-blue-50 font-medium text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.label}
                {item.href === "/content" && (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">NEW</span>
                )}
                {item.href === "/selection" && testingCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {testingCount} 款测品中
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <ShopSwitcher />
      </div>
    </header>
  );
}
