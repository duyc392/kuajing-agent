// 用途：工作台主界面：顶部店铺切换器、左侧对话列表、中部流式对话区（快捷指令、工具状态卡）、右下角 Agent 抽屉入口。
"use client";

import Header from "@/components/layout/header";
import { useShops } from "@/components/shop/shop-context";

export default function WorkspacePage() {
  const { shops, currentShopId } = useShops();
  const current = shops.find((shop) => shop.id === currentShopId) ?? null;

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-gray-900">
          {current ? `当前店铺：${current.name}（${current.market}）` : "尚无当前店铺"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">AI 对话中枢是下一个功能，届时 Agent 将在这里自动打招呼。</p>
      </div>
    </main>
  );
}
