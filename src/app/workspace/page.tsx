// 用途：工作台主界面：顶部店铺切换器、左侧对话列表、中部对话区（流式回复、工具状态卡、快捷指令）、右下角 Agent 抽屉入口。
"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import Sidebar from "@/components/layout/sidebar";
import ChatPanel from "@/components/chat/chat-panel";
import ShopOverviewCard from "@/components/shop/shop-overview-card";
import { useShops } from "@/components/shop/shop-context";

export default function WorkspacePage() {
  const { currentShopId } = useShops();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // 切换店铺后清空对话选中：旧店铺的对话在新店铺上下文中不可用（隔离铁律）。
  useEffect(() => {
    setSelectedId(null);
  }, [currentShopId]);

  return (
    <AppShell
      sidebar={
        <Sidebar activeId={selectedId} onSelect={setSelectedId} refreshSignal={refreshSignal} />
      }
    >
      {selectedId ? (
        <ChatPanel conversationId={selectedId} onTurnComplete={() => setRefreshSignal((count) => count + 1)} />
      ) : (
        <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-10">
          <ShopOverviewCard />
        </div>
      )}
    </AppShell>
  );
}
