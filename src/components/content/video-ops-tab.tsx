// 用途：内容创作子页①视频运营（规格 2.3）：上半部「短视频创作核心提炼」继承商品 DNA 三视图 + 下半部已发布视频清单表；
// 数据源：DNA 读 /api/products/[id]/dna，已发视频读 /api/content/published-videos，均按商品与店铺隔离。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ProductDnaView } from "@/types";
import type { PublishedVideoView } from "@/types/content";

const STATUS_TAG_CLASS: Record<string, string> = { 在跑: "bg-green-50 text-green-700", 停止: "bg-gray-100 text-gray-500" };

interface VideoOpsTabProps {
  productId: string;
  onGoToScripts: () => void;
  onGoToReview: (videoId: string) => void;
}

// DNA 加载：与数据源同构的过期作废模式；loaded 区分「加载中」与「确实未建 DNA」。
function useDna(productId: string, shopId: string) {
  const [dna, setDna] = useState<ProductDnaView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setDna(null);
    setLoaded(false);
    setError("");
    apiRequest<{ dna: ProductDnaView | null }>("GET", `/api/products/${productId}/dna?shopId=${shopId}`, undefined, controller.signal)
      .then((row) => {
        if (!stale) setDna(row.dna);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "商品 DNA 加载失败");
      })
      .finally(() => {
        if (!stale) setLoaded(true);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, reloadCount]);

  return { dna, loaded, error, retry: () => setReloadCount((count) => count + 1) };
}

// 已发布视频加载：同样过期作废。
function usePublishedVideos(productId: string, shopId: string) {
  const [videos, setVideos] = useState<PublishedVideoView[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setVideos(null);
    setError("");
    apiRequest<unknown>("GET", `/api/content/published-videos?productId=${productId}&shopId=${shopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("视频数据异常");
        setVideos(rows as PublishedVideoView[]);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "已发视频加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, reloadCount]);

  return { videos, error, retry: () => setReloadCount((count) => count + 1) };
}

export default function VideoOpsTab({ productId, onGoToScripts, onGoToReview }: VideoOpsTabProps) {
  const { currentShopId } = useShops();
  const dnaHook = useDna(productId, currentShopId ?? "");
  const videoHook = usePublishedVideos(productId, currentShopId ?? "");

  return (
    <div className="grid gap-5">
      <ExtractionCard dnaHook={dnaHook} />
      <PublishedVideoList videosHook={videoHook} onGoToScripts={onGoToScripts} onGoToReview={onGoToReview} />
    </div>
  );
}

// 上半部：短视频创作核心提炼三视图（继承 DNA）。
function ExtractionCard({ dnaHook }: { dnaHook: { dna: ProductDnaView | null; loaded: boolean; error: string; retry: () => void } }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">📺 短视频创作核心提炼</h2>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">继承自商品 DNA</span>
      </div>
      {dnaHook.error && <ErrorMessage message={dnaHook.error} onRetry={dnaHook.retry} />}
      {!dnaHook.loaded && !dnaHook.error && <Loading text="加载 DNA…" />}
      {dnaHook.loaded && dnaHook.dna === null && !dnaHook.error && (
        <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400">
          该商品还没有 DNA。去「商品」页建立六维 DNA 后，这里自动生成创作视角。
        </p>
      )}
      {dnaHook.dna !== null && <ExtractionFields dna={dnaHook.dna} />}
    </section>
  );
}

// 三视图字段：痛点取使用场景首句，视觉取视觉冲击，呈现方式取推荐格式。
function ExtractionFields({ dna }: { dna: ProductDnaView }) {
  const painPoint = dna.useScenarios ? dna.useScenarios.split("。")[0] : null;
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <div>
        <p className="text-xs font-semibold text-gray-500">🎯 核心主打痛点</p>
        <p className="mt-1 text-sm text-gray-800">{painPoint ?? dna.targetPersona ?? "（未提炼）"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500">👁️ 高能视觉高潮镜头</p>
        <p className="mt-1 text-sm text-gray-800">{dna.visualHooks ?? "（未提炼）"}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500">🛒 挂车与促销机制</p>
        <p className="mt-1 text-sm text-gray-800">在对话中补充优惠、挂车时机与 CTA，Agent 会写入对应脚本。</p>
        <p className="mt-1 text-xs text-gray-500">推荐呈现：{dna.recommendedFormats ?? "（未提炼）"}</p>
      </div>
    </div>
  );
}

// 下半部：本商品已发布视频清单表。
function PublishedVideoList({ videosHook, onGoToScripts, onGoToReview }: { videosHook: { videos: PublishedVideoView[] | null; error: string; retry: () => void }; onGoToScripts: () => void; onGoToReview: (videoId: string) => void }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">🎞️ 本商品已发布视频清单 {videosHook.videos !== null && `(${videosHook.videos.length} 条)`}</h2>
        <button onClick={onGoToScripts} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          ＋ 写新视频脚本
        </button>
      </div>
      {videosHook.error && <ErrorMessage message={videosHook.error} onRetry={videosHook.retry} />}
      {videosHook.videos === null && !videosHook.error && <Loading text="加载已发布视频…" />}
      {videosHook.videos !== null && !videosHook.error && <VideoTable videos={videosHook.videos} onGoToReview={onGoToReview} />}
    </section>
  );
}

function VideoTable({ videos, onGoToReview }: { videos: PublishedVideoView[]; onGoToReview: (videoId: string) => void }) {
  if (videos.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400">
        还没有发布过视频。写脚本、拍摄发布后，数据会回流到这里。
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/70">
            <th className="px-3 py-2 text-xs font-medium text-gray-500">视频标题 / Hook</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">流派角度</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">时长</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">播放量</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">带货销量</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">状态</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="border-b border-gray-100 last:border-b-0">
              <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{video.title}</td>
              <td className="px-3 py-2.5 text-sm text-gray-600">{video.angle}</td>
              <td className="px-3 py-2.5 text-sm text-gray-600">{video.durationSeconds} 秒</td>
              <td className="px-3 py-2.5 text-sm font-semibold text-gray-900">{video.playCount.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-sm text-gray-600">
                {video.orderCount} 单 ({video.gmv.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })})
              </td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TAG_CLASS[video.status] ?? "bg-gray-100 text-gray-500"}`}>{video.status}</span>
              </td>
              <td className="px-3 py-2.5">
                <button onClick={() => onGoToReview(video.id)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  查看漏斗复盘
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
