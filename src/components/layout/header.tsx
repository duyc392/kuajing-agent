// 用途：顶部导航栏：五个主页面互跳链接（PRD 导航规则）与店铺切换器，全站页面共用。
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ShopSwitcher from "@/components/layout/shop-switcher";

const NAV_ITEMS = [
  { href: "/workspace", label: "工作台" },
  { href: "/products", label: "商品" },
  { href: "/content", label: "内容创作" },
  { href: "/dashboard", label: "数据看板" },
  { href: "/settings", label: "设置" },
];
export default function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-2.5">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
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
              </Link>
            );
          })}
        </nav>
        <ShopSwitcher />
      </div>
    </header>
  );
}
