// 用途：选品调研工具卡（PRD 故事 13-15 与故事 8 工具调用可见）：市场分析 / 选品推荐 / 竞品分析的结构化报告展示。
// 运行中显示状态卡，完成后渲染四维度结论、推荐项或竞品对比六要素。
"use client";

import type { CompetitorDetails, MarketAnalysisDetails, RecommendationDetails, ToolCallRecord } from "@/types";

export function cardStyle(tone: "blue" | "green" | "red"): string {
  if (tone === "blue") return "rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700";
  if (tone === "red") return "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600";
  return "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700";
}

function RunningCard({ label, args }: { label: string; args: Record<string, unknown> | null }) {
  const market = typeof args?.market === "string" ? args.market : "";
  return <div className={`${cardStyle("blue")} animate-pulse`}>⚙ {label}中…{market !== "" ? `（${market}）` : ""}</div>;
}

function ErrorCard({ label, error }: { label: string; error?: string }) {
  return <div className={cardStyle("red")}>✗ {label}失败：{error ?? "请重试"}</div>;
}

function DimensionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1">
      <span className="text-gray-400">{label}：</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

export function MarketAnalysisCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") return <RunningCard label={call.label} args={(call.args as Record<string, unknown>) ?? null} />;
  if (call.status === "error") return <ErrorCard label={call.label} error={call.error} />;
  const details = call.details as MarketAnalysisDetails | undefined;
  if (!details) return null;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">📊 市场分析 · {details.market} · {details.category}</p>
      <DimensionRow label="市场容量" value={details.capacity} />
      <DimensionRow label="竞争度" value={details.competition} />
      <DimensionRow label="增长趋势" value={details.growth} />
      <DimensionRow label="利润空间" value={details.profit} />
      {details.dataHighlights.length > 0 && (
        <div className="mt-1 text-gray-400">
          关键数据：{details.dataHighlights.join("；")}
        </div>
      )}
    </div>
  );
}

export function RecommendationCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") return <RunningCard label={call.label} args={(call.args as Record<string, unknown>) ?? null} />;
  if (call.status === "error") return <ErrorCard label={call.label} error={call.error} />;
  const details = call.details as RecommendationDetails | undefined;
  if (!details) return null;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">💡 选品方向推荐 · {details.market}</p>
      {details.recommendations.map((item, index) => (
        <div key={index} className="mt-1">
          <p className="font-medium text-gray-800">方向 {index + 1}：{item.direction}</p>
          <p className="text-gray-600">数据支撑：{item.dataSupport}</p>
          <p className="text-gray-600">推荐理由：{item.reason}</p>
        </div>
      ))}
    </div>
  );
}

export function CompetitorCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") return <RunningCard label={call.label} args={(call.args as Record<string, unknown>) ?? null} />;
  if (call.status === "error") return <ErrorCard label={call.label} error={call.error} />;
  const details = call.details as CompetitorDetails | undefined;
  if (!details) return null;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">🏪 竞品分析 · {details.shopName}</p>
      <DimensionRow label="定价策略" value={details.pricing} />
      <DimensionRow label="内容风格" value={details.contentStyle} />
      <DimensionRow label="上新频率" value={details.listingFrequency} />
      <DimensionRow label="流量结构" value={details.trafficStructure} />
      <DimensionRow label="与你的店铺对比" value={details.comparison} />
      <DimensionRow label="建议的差异化方向" value={details.differentiation} />
    </div>
  );
}
