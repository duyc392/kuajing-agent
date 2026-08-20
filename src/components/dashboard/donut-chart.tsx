// 用途：环形占比图（纯 SVG，无第三方图表依赖）：GMV 份额分段 + 图例列表。
"use client";

import { formatPercent } from "@/lib/numbers";

interface ShareItem {
  label: string;
  gmvSharePercent: number;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];

// 扇形路径：按起止角度（0-360，12 点方向起算顺时针）生成 SVG path。
// 扫角钳制在 359.99° 以内：单渠道占比 100% 时起止点重合、弧长为零会导致整环画不出来。
function sectorPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const sweep = Math.min(endAngle - startAngle, 359.99);
  const toRad = (angle: number) => ((angle - 90) * Math.PI) / 180;
  const start = { x: cx + radius * Math.cos(toRad(startAngle)), y: cy + radius * Math.sin(toRad(startAngle)) };
  const end = { x: cx + radius * Math.cos(toRad(startAngle + sweep)), y: cy + radius * Math.sin(toRad(startAngle + sweep)) };
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

export default function DonutChart({ title, items }: { title: string; items: ShareItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-2 text-xs text-gray-400">（暂无数据）</p>
      </div>
    );
  }
  let cursor = 0;
  const segments = items.map((item, index) => {
    const start = cursor;
    cursor += item.gmvSharePercent * 3.6;
    return { ...item, start, end: cursor, color: COLORS[index % COLORS.length] };
  });
  const center = 70;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <div className="mt-2 flex items-center gap-4">
        <svg viewBox="0 0 140 140" className="h-28 w-28 shrink-0">
          {segments.map((segment) => (
            <path key={segment.label} d={sectorPath(center, center, 56, segment.start, segment.end)} fill={segment.color}>
              <title>{`${segment.label}: ${formatPercent(segment.gmvSharePercent)}`}</title>
            </path>
          ))}
          <circle cx={center} cy={center} r={30} fill="#ffffff" />
        </svg>
        <div className="grid gap-1 text-xs">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: segment.color }} />
              <span className="text-gray-700">{segment.label}</span>
              <span className="text-gray-400">{formatPercent(segment.gmvSharePercent)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
