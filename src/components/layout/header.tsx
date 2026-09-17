// 用途：顶部导航栏：六个主页面互跳链接（含选品调研与测品中数量徽标）与店铺切换器，全站页面共用。
// 测品数量 = 当前店铺 Product.testingStatus === "testing" 的商品数，选品沙盒推进成功后经事件即时刷新。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WorkspaceIcon from "@/components/shared/workspace-icon";
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

// 顶栏测品徽标：effect 绑定店铺与重载计数，切店/重跑先作废旧请求（取消信号），迟到响应不会跨店覆盖；
// 拉取失败保持 null（隐藏徽标），不显示看似有效的旧数字。
function useTestingCount(shopId: string | null) {
  const [count, setCount] = useState<number | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (shopId === null) {
      setCount(null);
      return;
    }
    const controller = new AbortController();
    setCount(null);
    apiRequest<ProductSummary[]>("GET", `/api/products?shopId=${encodeURIComponent(shopId)}`, undefined, controller.signal)
      .then((products) => setCount(products.filter((product) => product.testingStatus === "testing").length))
      .catch(() => undefined);
    return () => controller.abort();
  }, [shopId, reloadCount]);

  useEffect(() => {
    const onPoolChanged = () => setReloadCount((value) => value + 1);
    window.addEventListener(SELECTION_POOL_CHANGED_EVENT, onPoolChanged);
    return () => window.removeEventListener(SELECTION_POOL_CHANGED_EVENT, onPoolChanged);
  }, []);

  return count;
}

export default function Header() {
  const pathname = usePathname();
  const { currentShopId } = useShops();
  const testingCount = useTestingCount(currentShopId);

  return (
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <Link href="/workspace" className="workspace-brand" aria-label="跨境 Agent 工作台">
          <WorkspaceIcon name="logo" width="36" height="32" /><span>跨境 Agent</span>
        </Link>
        <nav className="workspace-navigation" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="workspace-nav-link"
              >
                {item.label}
                {item.href === "/content" && (
                  <span className="workspace-nav-badge">NEW</span>
                )}
                {item.href === "/selection" && testingCount !== null && testingCount > 0 && (
                  <span className="workspace-nav-badge">
                    {testingCount} 款测品中
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <ShopSwitcher className="header-shop-switcher" />
      </div>
    </header>
  );
}
