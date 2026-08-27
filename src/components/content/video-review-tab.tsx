// 用途：内容创作子页⑤数据复盘（规格 2.7）：左侧已发布视频子列表 + 右侧秒级留存折线与分镜对齐 + 底部 AI 闭环建议卡；
// 「生成 V2 脚本」按钮在 Agent 能力落地前引导到工作台对话（V2 版本链路已在数据模型预埋 version/parentScriptId）。
// 结构：数据 Hook（useVideoReviewData）+ 三个子组件（视频列表 / 留存区 / 闭环建议卡），主组件只做组合。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { PublishedVideoView, VideoReviewView } from "@/types/content";

interface VideoReviewTabProps {
  productId: string;
  initialVideoId?: string | null;
  onGoToScripts: (review: VideoReviewView) => void;
}

// 数据与选中状态：视频列表加载（过期作废）→ 选中视频 → 复盘加载（带 loaded 标记，重试计数驱动）。
function useVideoReviewData(productId: string, shopId: string | null, initialVideoId: string | null) {
  const [videos, setVideos] = useState<PublishedVideoView[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<VideoReviewView | null>(null);
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!shopId) return;
    let stale = false;
    const controller = new AbortController();
    setVideos(null);
    setError("");
    apiRequest<unknown>("GET", `/api/content/published-videos?productId=${productId}&shopId=${shopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("视频数据异常");
        const list = rows as PublishedVideoView[];
        setVideos(list);
        setSelectedId((prev) => {
          if (initialVideoId && list.some((item) => item.id === initialVideoId)) return initialVideoId;
          return prev && list.some((item) => item.id === prev) ? prev : (list[0]?.id ?? null);
        });
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "已发视频加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, initialVideoId, reloadCount]);

  // 复盘加载：仅在最下层 loading 状态时拉取；无复盘为正常态（review 为 null），加载完成由 reviewLoaded 标记。
  useEffect(() => {
    if (!shopId || selectedId === null) return;
    let stale = false;
    setReview(null);
    setReviewLoaded(false);
    setReviewError("");
    apiRequest<{ review: VideoReviewView | null }>("GET", `/api/content/video-reviews/${selectedId}?shopId=${shopId}&productId=${productId}`)
      .then((row) => {
        if (!stale) setReview(row.review);
      })
      .catch((e: Error) => {
        if (!stale) setReviewError(e.message || "复盘加载失败");
      })
      .finally(() => {
        if (!stale) setReviewLoaded(true);
      });
    return () => {
      stale = true;
    };
  }, [productId, selectedId, shopId, reloadCount]);

  return { videos, selectedId, setSelectedId, review, reviewLoaded, reviewError, error, retry: () => setReloadCount((count) => count + 1) };
}

export default function VideoReviewTab({ productId, initialVideoId = null, onGoToScripts }: VideoReviewTabProps) {
  const { currentShopId } = useShops();
  const data = useVideoReviewData(productId, currentShopId, initialVideoId);

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }
  if (data.videos === null && !data.error) return <Loading text="加载视频数据…" />;
  if (data.error) return <ErrorMessage message={data.error} onRetry={data.retry} />;

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <VideoList videos={data.videos ?? []} selectedId={data.selectedId} onSelect={data.setSelectedId} />
        <div className="min-w-0 grid gap-4">
          <RetentionSection
            selectedId={data.selectedId}
            review={data.review}
            loaded={data.reviewLoaded}
            error={data.reviewError}
            retentionData={data.videos?.find((video) => video.id === data.selectedId)?.retentionData ?? []}
            onRetry={data.retry}
          />
          {data.review !== null && <LoopbackCard review={data.review} onGoToScripts={onGoToScripts} />}
        </div>
      </div>
    </div>
  );
}

// 左侧已发布视频子列表：选中态蓝框，点击切换复盘。
function VideoList({ videos, selectedId, onSelect }: { videos: PublishedVideoView[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <aside className="grid content-start gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <p className="px-2 text-xs font-semibold text-gray-500">选择已发布视频</p>
      {videos.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400">暂无已发布视频。</p>
      )}
      {videos.map((video) => (
        <button
          key={video.id}
          onClick={() => onSelect(video.id)}
          className={`rounded-lg px-3 py-2 text-left ${selectedId === video.id ? "bg-blue-50 ring-1 ring-blue-300" : "bg-white hover:bg-gray-100"}`}
        >
          <p className="truncate text-sm font-semibold text-gray-900">{video.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">播放 {(video.playCount / 1000).toFixed(1)}K · 完播 {video.completionRate !== null ? `${video.completionRate}%` : "—"}</p>
        </button>
      ))}
    </aside>
  );
}

// 右侧留存区：标题 + 加载/空态 + 留存曲线。
function RetentionSection({ selectedId, review, loaded, error, retentionData, onRetry }: { selectedId: string | null; review: VideoReviewView | null; loaded: boolean; error: string; retentionData: number[]; onRetry: () => void }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">📈 秒级留存折线图与分镜对齐</h2>
        {review?.dropPointSeconds !== null && review?.dropPointSeconds !== undefined && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">⚠️ {review.dropPointSeconds}s 断崖流失</span>
        )}
      </div>
      {selectedId === null && <p className="mt-4 text-center text-sm text-gray-400">请选择左侧视频查看复盘。</p>}
      {selectedId !== null && error !== "" && <ErrorMessage message={error} onRetry={onRetry} />}
      {selectedId !== null && error === "" && !loaded && <Loading text="加载复盘…" />}
      {selectedId !== null && review !== null && <RetentionProfile review={review} retentionData={retentionData} />}
      {selectedId !== null && loaded && review === null && error === "" && (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400">该视频暂无秒级数据与复盘。</p>
      )}
    </section>
  );
}

// 底部 AI 闭环优化建议卡：红色描边，展示建议列表，生成 V2 跳工作台对话。
function LoopbackCard({ review, onGoToScripts }: { review: VideoReviewView; onGoToScripts: (review: VideoReviewView) => void }) {
  return (
    <section className="rounded-xl border-2 border-red-400">
      <div className="rounded-[calc(0.75rem-2px)] bg-red-50 p-4">
        <h2 className="text-sm font-semibold text-red-600">🤖 AI 闭环优化建议 (生成 V2 脚本)</h2>
        <ul className="mt-2 grid gap-1 text-sm text-gray-800">
          {review.suggestions.map((suggestion, index) => (
            <li key={index}>• {suggestion}</li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <button onClick={() => onGoToScripts(review)} className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700">
            ⚡ 去脚本库生成 V2
          </button>
        </div>
      </div>
    </section>
  );
}

// 留存剖面：用秒级留存数组画 SVG 折线（无第三方图表库）；
// 横轴按数据点近似平均分布的秒数，纵轴为留存百分比（首个点通常 100），断崖点标红。
function RetentionProfile({ review, retentionData }: { review: VideoReviewView; retentionData: number[] }) {
  const data = retentionData;
  if (data.length < 2) {
    return (
      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
        {review.dropPointSeconds !== null ? (
          <p className="text-xs text-gray-700">• 第 {review.dropPointSeconds}s：⚠️ 流失率最高 {review.dropRate ?? "—"}%（{review.summary}）</p>
        ) : (
          <p className="text-xs text-gray-500">无秒级数据，暂不绘制曲线。</p>
        )}
      </div>
    );
  }
  const W = 560;
  const H = 180;
  const PX = 40;
  const PY = 10;
  const maxY = 100;
  const stepX = (W - PX * 2) / (data.length - 1);
  const yOf = (value: number) => H - PY - (Math.max(0, Math.min(value, maxY)) / maxY) * (H - PY * 2);
  const points = data.map((value, index) => ({ x: PX + index * stepX, y: yOf(value) }));
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  const lastX = PX + (data.length - 1) * stepX;
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full font-mono text-[10px] text-gray-400" role="img" aria-label="秒级留存曲线">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = yOf(tick);
            return (
              <g key={tick}>
                <line x1={PX} x2={W - PX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={4} y={y + 3}>{tick}%</text>
              </g>
            );
          })}
          <polyline points={`${PX},${H - PY} ${path}`} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
          {review.dropPointSeconds !== null && points[review.dropPointSeconds] && (
            <circle cx={points[review.dropPointSeconds].x} cy={points[review.dropPointSeconds].y} r="4" fill="#ef4444" />
          )}
          <text x={lastX - 60} y={H - 2} className="text-gray-400">0s → {Math.max(1, data.length - 1)}s</text>
        </svg>
        {review.dropPointSeconds !== null ? (
          <p className="mt-2 text-xs text-red-600">⚠️ 第 {review.dropPointSeconds}s：流失率最高 {review.dropRate ?? "—"}%（{review.summary}）</p>
        ) : (
          <p className="mt-2 text-xs text-gray-500">无明显断崖流失点。</p>
        )}
      </div>
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
        <p className="text-xs font-semibold text-gray-500">AI 诊断摘要</p>
        <p className="mt-1.5 text-sm text-gray-700">{review.summary}</p>
      </div>
    </div>
  );
}
