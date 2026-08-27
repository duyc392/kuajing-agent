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
    `rounded-lg px-4 py-1.5 text-sm font-medium ${active ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-100"}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab("video")} className={tabClass(tab === "video")}>🎬 视频运营 (短视频脚本)</button>
        <button onClick={() => setTab("live")} className={tabClass(tab === "live")}>🎙️ 直播脚本</button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-agent-drawer"))}
          className="ml-auto rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:opacity-95"
          title="在对话中告诉 Agent 商品名称与脚本要求即可生成"
        >
          🤖 让 AI 生成脚本
        </button>
      </div>
      {structure && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
          <p className="text-sm font-semibold text-purple-800">已带入爆款结构：{structure.title}</p>
          <p className="mt-1 text-xs text-purple-700">Hook：{structure.hook} · CTA：{structure.cta}</p>
          <p className="mt-2 text-xs text-purple-600">点击上方 AI 入口，在对话中要求 Agent 按此结构生成当前商品脚本。</p>
        </div>
      )}
      {review && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="text-sm font-semibold text-red-800">待生成 V2 的复盘建议</p>
          <ul className="mt-1 grid gap-1 text-xs text-red-700">
            {review.suggestions.map((suggestion, index) => <li key={index}>• {suggestion}</li>)}
          </ul>
          <p className="mt-2 text-xs text-red-600">当前 Mock 视频未关联可回填的数据库脚本；接入真实视频数据后可在此生成并回写 V2。</p>
        </div>
      )}
      {tab === "video" ? (
        <ScriptList productId={productId} />
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
          🎙️ 直播脚本功能规划中，敬请期待！
        </p>
      )}
    </div>
  );
}
