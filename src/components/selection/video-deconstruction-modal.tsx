// 用途：爆款视频深度透视弹窗（原型弹窗）：4 节点关键帧 + Whisper 原声台词 + 8 维事实；
// 「套用此分镜写脚本」调用 /api/selection/draft-scripts 生成临时脚本并回传父层挂载到候选品。
"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { mockVideoUrlOf } from "@/config/selection";
import type { GenerateDraftScriptResult, SelectionCandidate, VideoInsightResult } from "@/types";

interface VideoDeconstructionModalProps {
  candidate: SelectionCandidate;
  shopId: string | null;
  onClose: () => void;
  onApply: (candidateId: string, script: GenerateDraftScriptResult["script"]) => void;
}

const PHASE_LABELS: Record<VideoInsightResult["sections"][number]["phase"], { label: string; cls: string }> = {
  hook: { label: "Hook", cls: "text-rose-600" },
  intro: { label: "进品", cls: "text-[#2e6350]" },
  demo: { label: "演示", cls: "text-[#2e6350]" },
  cta: { label: "挂车", cls: "text-emerald-600" },
};

// 左侧：视频预览 + 4 节点关键帧。
function InsightPreview({ insight }: { insight: VideoInsightResult }) {
  return (
    <div className="space-y-3 md:col-span-5">
      <div className="flex h-56 flex-col items-center justify-center rounded-xl bg-slate-900 text-white">
        <span className="text-3xl text-white/80">▶️</span>
        <p className="mt-2 text-[11px] text-slate-400">无水印高清视频（模拟）</p>
        <div className="mt-2 flex w-full justify-between rounded bg-black/60 px-2 py-1 text-[10px] text-slate-300">
          <span>00:00 / 00:{String(insight.durationSeconds).padStart(2, "0")}</span>
          <span>1080P · 165 wpm</span>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold text-gray-700">关键帧截取</p>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {insight.sections.map((section) => (
            <div key={section.phase} className="rounded border border-gray-200 bg-gray-100 p-1">
              <div className={`text-[10px] font-bold ${PHASE_LABELS[section.phase].cls}`}>{section.timeRange.split(" - ")[0]} {PHASE_LABELS[section.phase].label}</div>
              <div className="my-1 text-xs">🎞️</div>
              <div className="truncate text-[9px] text-gray-500" title={section.keyframeDescription}>{section.keyframeDescription}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 右侧：原声逐字稿 + 客观事实。
function InsightTranscript({ insight }: { insight: VideoInsightResult }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
      <p className="mb-2 border-b border-gray-200 pb-1.5 text-xs font-bold text-gray-900">原声英文逐字稿</p>
      <div className="max-h-44 space-y-2 overflow-y-auto pr-1 text-xs">
        {insight.sections.map((section) => (
          <div key={section.phase} className="space-y-0.5 rounded border border-gray-100 bg-white p-1.5">
            <span className={`text-[10px] font-mono font-bold ${PHASE_LABELS[section.phase].cls}`}>[{section.timeRange}] {PHASE_LABELS[section.phase].label}:</span>
            <p className="font-medium text-gray-800">{section.englishLine}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightFacts({ facts }: { facts: string[] }) {
  return (
    <div className="rounded-xl border border-[#b8ddd0] bg-[var(--workspace-soft)]/60 p-3.5 text-xs text-gray-700">
      <p className="mb-2 font-bold text-[#193630]">核心事实提炼</p>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {facts.map((fact) => <div key={fact}>{fact}</div>)}
      </div>
    </div>
  );
}

export default function VideoDeconstructionModal({ candidate, shopId, onClose, onApply }: VideoDeconstructionModalProps) {
  const [insight, setInsight] = useState<VideoInsightResult | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadInsight = useCallback(() => {
    if (shopId === null) {
      setError("尚未选择店铺，无法分析视频");
      return;
    }
    setError("");
    apiRequest<VideoInsightResult>("POST", "/api/selection/video-insights", { shopId, candidateId: candidate.candidateId, videoUrl: mockVideoUrlOf(candidate.candidateId) })
      .then(setInsight)
      .catch((e: Error) => setError(e.message || "视频透视加载失败"));
  }, [shopId, candidate.candidateId]);

  useEffect(() => {
    loadInsight();
  }, [loadInsight]);

  async function applyScript() {
    if (shopId === null || insight === null) return;
    setGenerating(true);
    setError("");
    try {
      const result = await apiRequest<GenerateDraftScriptResult>(
        "POST",
        "/api/selection/draft-scripts",
        {
          shopId,
          candidate,
          videoInsight: insight,
        },
        undefined,
        60000,
      );
      onApply(candidate.candidateId, result.script);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "脚本生成失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--workspace-soft)] text-sm font-bold text-[#2e6350]">🎬</span>
            <div>
              <h3 className="text-sm font-bold text-gray-900">视频深度透视 · {candidate.name}</h3>
              <p className="text-[11px] text-gray-400">模拟播放 2.4M · 点赞 180K · 带货出单 3,420 单（假数据）</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
        </div>

        {error !== "" && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {insight === null && error === "" && <p className="mt-6 text-center text-xs text-gray-400">正在分析视频…</p>}

        {insight !== null && (
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-12">
            <InsightPreview insight={insight} />
            <div className="space-y-4 md:col-span-7">
              <InsightTranscript insight={insight} />
              <InsightFacts facts={insight.objectiveFacts} />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200">关闭</button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void applyScript()}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--workspace-primary)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#315647] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📝 {generating ? "生成中…" : "套用此分镜写脚本"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
