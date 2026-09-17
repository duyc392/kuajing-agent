// 用途：内容创作子页③脚本库（方案 A：复用现有脚本页体系）：顶部「视频运营 / 直播脚本」切换 +「让 AI 生成脚本」入口（跳工作台对话），
// 视频运营嵌入现有 ScriptList，并以左侧当前商品过滤；直播脚本按规格只显示占位说明，不展示旧直播脚本管理功能。
"use client";

import { useState } from "react";
import ScriptList from "@/components/scripts/script-list";
import type { ContentReferenceView } from "@/types/content";
import type { VideoReviewView } from "@/types/content";

type ScriptTab = "video" | "live";

interface ScriptLibraryTabProps {
  productId: string;
  structure?: ContentReferenceView | null;
  review?: VideoReviewView | null;
}

export default function ScriptLibraryTab({ productId, structure = null, review = null }: ScriptLibraryTabProps) {
  const [tab, setTab] = useState<ScriptTab>("video");
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? "bg-[var(--workspace-soft)] text-[#2e6350]" : "text-[var(--workspace-muted)] hover:bg-[#f0f5f1]"}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab("video")} className={tabClass(tab === "video")}>视频脚本</button>
        <button onClick={() => setTab("live")} className={tabClass(tab === "live")}>直播（规划中）</button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-agent-drawer"))}
          className="btn btn-primary btn-sm ml-auto"
          title="在对话中告诉 Agent 商品名称与脚本要求即可生成"
        >
          ＋ 让 Agent 写脚本
        </button>
      </div>
      {structure && (
        <div className="page-card bg-[#f6f9f6] p-4">
          <p className="text-sm font-semibold">已带入爆款结构：{structure.title}</p>
          <p className="mt-1 text-xs text-[#3b534c]">Hook：{structure.hook} · CTA：{structure.cta}</p>
          <p className="mt-2 text-xs text-[var(--workspace-muted)]">点击上方「让 Agent 写脚本」，在对话中要求 Agent 按此结构生成当前商品脚本。</p>
        </div>
      )}
      {review && (
        <div className="rounded-xl border border-[var(--workspace-border)] bg-[#fbf3df] p-4">
          <p className="text-sm font-semibold text-[#9a6700]">待生成 V2 的复盘建议</p>
          <ul className="mt-1 grid gap-1 text-xs text-[#7c5400]">
            {review.suggestions.map((suggestion, index) => <li key={index}>• {suggestion}</li>)}
          </ul>
          <p className="mt-2 text-xs text-[#9a6700]/80">当前 Mock 视频未关联可回填的数据库脚本；接入真实视频数据后可在此生成并回写 V2。</p>
        </div>
      )}
      {tab === "video" ? (
        <ScriptList productId={productId} />
      ) : (
        <p className="page-card border-dashed p-10 text-center text-sm text-[var(--workspace-muted)]">
          直播脚本功能规划中，敬请期待。
        </p>
      )}
    </div>
  );
}
