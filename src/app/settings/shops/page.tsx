// 用途：店铺管理页（设置分组）：切换当前店铺、编辑资料、归档 / 恢复、新建入口。
import Link from "next/link";
import Header from "@/components/layout/header";
import ShopManager from "@/components/shop/shop-manager";

export const metadata = {
  title: "店铺管理 · TikTok 跨境电商工作台",
};

export default function SettingsShopsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6">
          <Link href="/settings" className="text-xs text-gray-400 hover:text-gray-600">← 返回设置</Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">店铺管理</h1>
          <p className="mt-2 text-sm text-gray-500">
            切换当前店铺、编辑资料、归档不再经营的店铺；所有页面数据都会跟随当前店铺切换。
          </p>
        </header>
        <ShopManager />
      </div>
    </main>
  );
}
