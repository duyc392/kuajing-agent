// 用途：创建店铺页的分流外壳：无店铺（首次引导）用居中引导布局 + 步骤指示器；已有店铺（从管理页/切换器进入）套全局壳。
"use client";

import Link from "next/link";
import AppShell from "@/components/layout/app-shell";
import Loading from "@/components/shared/loading";
import { StepIndicator } from "@/components/shared/step-indicator";
import ShopForm from "@/components/shop/shop-form";
import { useShops } from "@/components/shop/shop-context";

const STEPS = [
  { label: "配置密钥", active: false },
  { label: "创建店铺", active: true },
  { label: "开始使用", active: false },
];

function OnboardingFooter() {
  return (
    <p className="mt-6 text-center text-xs text-[var(--workspace-muted)]">
      已有店铺？<Link href="/settings/shops" className="link-accent">去店铺管理页</Link> 切换或新增。
    </p>
  );
}

export default function CreateShopScreen() {
  const { shops, loading } = useShops();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loading text="正在加载…" />
      </div>
    );
  }

  if (shops.length > 0) {
    return (
      <AppShell>
        <div className="page-shell mx-auto max-w-2xl !px-0">
          <header className="page-header">
            <div>
              <h1 className="page-title">新建店铺</h1>
              <p className="page-subtitle">创建后可在顶栏切换器随时切换店铺。</p>
            </div>
            <div className="page-actions">
              <Link href="/settings/shops" className="btn btn-outline btn-sm">← 返回店铺管理</Link>
            </div>
          </header>
          <ShopForm />
        </div>
      </AppShell>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--workspace-bg)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold">创建你的店铺</h1>
          <p className="mt-2 text-sm text-[var(--workspace-muted)]">
            选品、文案、脚本都会基于这个店铺进行；之后可以随时添加更多店铺并切换。
          </p>
        </header>
        <StepIndicator steps={STEPS} />
        <ShopForm />
        <OnboardingFooter />
      </div>
    </main>
  );
}
