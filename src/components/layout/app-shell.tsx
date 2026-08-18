// 用途：全局布局外壳：顶部 Header（导航 + 店铺切换器）、可选左侧对话列表、可滚动主内容区、右下角全局 Agent 入口；店铺上下文加载失败时整壳降级为错误重试页。
"use client";

import type { ReactNode } from "react";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import AgentDrawer from "@/components/chat/agent-drawer";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { useShops } from "@/components/shop/shop-context";

interface AppShellProps {
  children: ReactNode;
  withSidebar?: boolean;
}

export default function AppShell({ children, withSidebar = false }: AppShellProps) {
  const { loading, error, refresh } = useShops();

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <ErrorMessage message={`店铺信息加载失败：${error}`} onRetry={() => void refresh()} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loading text="正在加载工作台…" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <Header />
      <div className="flex min-h-0 flex-1">
        {withSidebar && <Sidebar />}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <AgentDrawer />
    </div>
  );
}
