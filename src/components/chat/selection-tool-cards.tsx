// 用途：选品调研工具卡（PRD 故事 13-15 与故事 8 工具调用可见）：市场分析 / 选品推荐 / 竞品分析的结构化报告展示。
// 运行中/失败/格式异常统一走 ToolStatusCard，完成态渲染四维度结论、推荐项或竞品对比六要素；缺失字段回退到格式异常卡。
"use client";

import type { CompetitorDetails, MarketAnalysisDetails, RecommendationDetails, ToolCallRecord } from "@/types";
import ToolStatusCard, { cardStyle } from "@/components/chat/tool-status-card";

function DimensionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1">
      <span className="text-gray-400">{label}：</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

function runningMeta(args: unknown): string {
  const market = (args as { market?: unknown } | null)?.market;
  return typeof market === "string" && market !== "" ? `（${market}）` : "";
}

export function MarketAnalysisCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" meta={runningMeta(call.args)} />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as MarketAnalysisDetails | undefined;
  if (!details || typeof details.market !== "string" || !Array.isArray(details.dataHighlights)) {
    return <ToolStatusCard label={call.label} status="invalid" />;
  }
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
  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" meta={runningMeta(call.args)} />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as RecommendationDetails | undefined;
  if (!details || typeof details.market !== "string" || !Array.isArray(details.recommendations)) {
    return <ToolStatusCard label={call.label} status="invalid" />;
  }
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
  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" meta={runningMeta(call.args)} />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as CompetitorDetails | undefined;
  if (!details || typeof details.shopName !== "string") {
    return <ToolStatusCard label={call.label} status="invalid" />;
  }
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
