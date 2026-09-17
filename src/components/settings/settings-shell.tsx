// 用途：设置分区壳：统一的「设置」页头 + 左侧分区导航（店铺/模型/密钥/记忆/技能/导出）+ 右侧内容区；
// 五个子路由共用本壳，当前分区以浅绿胶囊高亮；窄屏时导航折叠为网格。
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/app-shell";
import WorkspaceIcon from "@/components/shared/workspace-icon";

const SECTIONS = [
  { href: "/settings/shops", label: "店铺管理", icon: "store" },
  { href: "/settings/models", label: "模型与 API Key", icon: "sliders" },
  { href: "/settings/memory", label: "Agent 记忆", icon: "document" },
  { href: "/settings/skills", label: "技能管理", icon: "sparkle" },
  { href: "/settings/export", label: "数据导出", icon: "download" },
] as const;

interface SettingsShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function SettingsShell({ title, subtitle, children }: SettingsShellProps) {
  const pathname = usePathname();
  return (
    <AppShell>
      <div className="page-shell">
        <header className="page-header">
          <div>
            <h1 className="page-title">设置</h1>
            <p className="page-subtitle">管理店铺与服务配置。</p>
          </div>
        </header>
        <div className="settings-layout">
          <nav className="page-card settings-nav" aria-label="设置分区">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                aria-current={pathname === section.href ? "page" : undefined}
                className="settings-nav-link"
              >
                <WorkspaceIcon name={section.icon} width="17" height="17" />
                {section.label}
              </Link>
            ))}
          </nav>
          <main className="grid min-w-0 content-start gap-4">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-[var(--workspace-muted)]">{subtitle}</p>}
            </div>
            {children}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
