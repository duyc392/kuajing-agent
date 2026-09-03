// 用途：工具调用卡片：运行中/失败/格式异常统一走 ToolStatusCard（故事 8 工具调用可见），完成后展示结构化结果；
// 文案/视频脚本/直播脚本/选品调研有专属卡片，未知工具显示通用回退卡片。
"use client";

import { COMPETITOR_TOOL_NAME, COPY_TOOL_NAME, IMAGE_TOOL_NAME, IMAGE_VARIANT_TOOL_NAME, LIVE_SCRIPT_TOOL_NAME, MARKET_TOOL_NAME, PROPOSE_SKILL_TOOL_NAME, RECOMMEND_TOOL_NAME, SCRIPT_TOOL_NAME, SELECTION_WORKBENCH_TOOL_NAME } from "@/types";
import type { CopyToolDetails, ImageToolDetails, LiveScriptToolDetails, ScriptToolDetails, ToolCallRecord } from "@/types";
import { CompetitorCard, MarketAnalysisCard, RecommendationCard } from "@/components/chat/selection-tool-cards";
import SkillProposalCard from "@/components/chat/skill-proposal-card";
import SelectionWorkbenchCard from "@/components/chat/selection-workbench-card";
import ToolStatusCard, { cardStyle } from "@/components/chat/tool-status-card";

function CopyToolCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") {
    const language = (call.args as { language?: string } | null)?.language ?? "—";
    return <ToolStatusCard label={call.label} status="running" meta={`（语言 ${language}）`} />;
  }
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as CopyToolDetails | undefined;
  if (!details || typeof details.title !== "string") return <ToolStatusCard label={call.label} status="invalid" />;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">📝 商品文案 · {details.language} · 第 {details.version} 版</p>
      <p className="mt-1 font-medium text-gray-800">{details.title}</p>
      {details.sellingPoints !== "" && <p className="mt-1 whitespace-pre-wrap text-gray-600">{details.sellingPoints}</p>}
      <p className="mt-1 text-gray-400">已保存到商品详情页「文案历史」。</p>
    </div>
  );
}

function ScriptToolCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") {
    const args = call.args as { type?: string; duration?: number } | null;
    const meta = args?.type ? `（${args.type} · ${args.duration ?? "—"} 秒）` : "";
    return <ToolStatusCard label={call.label} status="running" meta={meta} />;
  }
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as ScriptToolDetails | undefined;
  if (!details || typeof details.hook !== "string") return <ToolStatusCard label={call.label} status="invalid" />;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">🎬 视频脚本 · {details.type} · {details.duration} 秒 · {details.shotCount} 个分镜</p>
      <p className="mt-1 text-gray-600">钩子：{details.hook}</p>
      <p className="text-gray-600">行动号召：{details.cta}</p>
      <p className="mt-1 text-gray-400">已保存到「脚本」页面。</p>
    </div>
  );
}

function LiveScriptToolCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") {
    const args = call.args as { durationMinutes?: number } | null;
    const meta = args?.durationMinutes ? `（${args.durationMinutes} 分钟）` : "";
    return <ToolStatusCard label={call.label} status="running" meta={meta} />;
  }
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as LiveScriptToolDetails | undefined;
  if (!details || typeof details.durationMinutes !== "number") return <ToolStatusCard label={call.label} status="invalid" />;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">🔴 直播脚本 · {details.durationMinutes} 分钟 · {details.segmentCount} 个阶段 · {details.productCount} 个商品</p>
      <p className="mt-1 text-gray-400">已保存到「脚本」页面。</p>
    </div>
  );
}

// 图片工具卡：完成态渲染缩略图预览；本地静态图片直接 img 渲染。
function ImageToolCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" meta="（生成图片通常需要十几秒）" />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as ImageToolDetails | undefined;
  if (!details || !Array.isArray(details.paths)) return <ToolStatusCard label={call.label} status="invalid" />;
  return (
    <div className={cardStyle("green")}>
      <p className="font-medium text-gray-900">
        🖼 {details.type === "main" ? "商品主图" : details.type === "detail" ? "商品详情图" : "图片变体"} · {details.productName} · {details.imageCount} 张
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {details.paths.map((imagePath) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={imagePath} src={imagePath} alt="生成的商品图片" className="h-16 w-16 rounded-lg border border-gray-200 bg-gray-100 object-cover" />
        ))}
      </div>
      <p className="mt-1 text-gray-400">已保存为草稿，可在商品详情页「图片」标签查看并应用。</p>
    </div>
  );
}

function GenericToolCard({ call }: { call: ToolCallRecord }) {
  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  return <div className={cardStyle("green")}>✓ {call.label}已完成。</div>;
}

export default function ToolCard({ call, messageId }: { call: ToolCallRecord; messageId?: string }) {
  if (call.toolName === COPY_TOOL_NAME) return <CopyToolCard call={call} />;
  if (call.toolName === SCRIPT_TOOL_NAME) return <ScriptToolCard call={call} />;
  if (call.toolName === LIVE_SCRIPT_TOOL_NAME) return <LiveScriptToolCard call={call} />;
  if (call.toolName === MARKET_TOOL_NAME) return <MarketAnalysisCard call={call} />;
  if (call.toolName === RECOMMEND_TOOL_NAME) return <RecommendationCard call={call} />;
  if (call.toolName === COMPETITOR_TOOL_NAME) return <CompetitorCard call={call} />;
  if (call.toolName === IMAGE_TOOL_NAME || call.toolName === IMAGE_VARIANT_TOOL_NAME) return <ImageToolCard call={call} />;
  if (call.toolName === PROPOSE_SKILL_TOOL_NAME) return <SkillProposalCard call={call} messageId={messageId} />;
  if (call.toolName === SELECTION_WORKBENCH_TOOL_NAME) return <SelectionWorkbenchCard call={call} />;
  return <GenericToolCard call={call} />;
}
