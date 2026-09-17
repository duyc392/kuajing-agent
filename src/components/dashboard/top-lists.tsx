// 用途：看板列表组件：内容表现（视频转化率条）与类目表现（GMV 占比条）。
"use client";

import { formatCompactNumber, formatPercent } from "@/lib/numbers";
import type { DashboardCategoryItem, DashboardContentItem } from "@/types";

export function ContentPerformance({ items }: { items: DashboardContentItem[] }) {
  if (items.length === 0) {
    return (
      <div className="page-card p-5">
        <p className="text-sm font-medium">内容表现（Top 视频）</p>
        <p className="mt-2 text-xs text-gray-400">（暂无视频数据）</p>
      </div>
    );
  }
  const maxPlays = Math.max(...items.map((item) => item.plays), 1);
  return (
    <div className="page-card p-5">
      <p className="text-sm font-medium">内容表现（Top 视频）</p>
      <div className="mt-2 grid gap-2">
        {items.map((item, index) => (
          <div key={index} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-xs text-gray-800" title={item.title}>{index + 1}. {item.title}</p>
              <p className="shrink-0 text-xs text-[var(--workspace-muted)]">
                播放 {formatCompactNumber(item.plays)} · 销量 {formatCompactNumber(item.unitsSold)} · 转化 {formatPercent(item.conversionRatePercent)}
              </p>
            </div>
            <div className="h-1.5 w-full rounded bg-gray-100">
              <div className="h-1.5 rounded bg-[#41876d]" style={{ width: `${Math.max((item.plays / maxPlays) * 100, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryPerformance({ items }: { items: DashboardCategoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="page-card p-5">
        <p className="text-sm font-medium">类目表现（按 GMV）</p>
        <p className="mt-2 text-xs text-gray-400">（暂无类目数据）</p>
      </div>
    );
  }
  return (
    <div className="page-card p-5">
      <p className="text-sm font-medium">类目表现（按 GMV）</p>
      <div className="mt-2 grid gap-2">
        {items.map((item, index) => (
          <div key={index} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-gray-800">{index + 1}. {item.name}</p>
              <p className="shrink-0 text-xs text-[var(--workspace-muted)]">{formatPercent(item.gmvSharePercent)}</p>
            </div>
            <div className="h-1.5 w-full rounded bg-gray-100">
              <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${Math.max(item.gmvSharePercent, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
