// 用途：内容创作页工作区（规格 2.1-2.2）：左侧选择创作商品 + 右侧五个二级子页（视频运营/内容库/脚本库/素材需求库/数据复盘），子页随商品切换联动；
// 切换商品或店铺自动回到第一个子页；子页各自按 productId 拉取内容运营数据，选中商品同步至 URL（?productId=）。
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import ContentSidebar from "@/components/content/content-sidebar";
import VideoOpsTab from "@/components/content/video-ops-tab";
import ContentLibraryTab from "@/components/content/content-library-tab";
import ScriptLibraryTab from "@/components/content/script-library-tab";
import ShotRequirementsTab from "@/components/content/shot-requirements-tab";
import VideoReviewTab from "@/components/content/video-review-tab";
import type { ProductSummary } from "@/types";
import type { ContentReferenceView } from "@/types/content";
import type { VideoReviewView } from "@/types/content";

type ContentTabKey = "ops" | "library" | "scripts" | "shots" | "review";

const TABS: { key: ContentTabKey; label: string; sub: string }[] = [
  { key: "ops", label: "① 视频运营", sub: "产品档案" },
  { key: "library", label: "② 内容库", sub: "爆款搜拆" },
  { key: "scripts", label: "③ 脚本库", sub: "视频与直播" },
  { key: "shots", label: "④ 素材需求库", sub: "" },
  { key: "review", label: "⑤ 数据复盘", sub: "" },
];

// 店铺/重载变化时重新拉取商品列表，过期请求作废 + 取消信号。
function useProducts(currentShopId: string | null) {
  const [list, setList] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setList(null);
    setError("");
    apiRequest<unknown>("GET", `/api/products?shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("商品列表数据异常");
        setList(rows as ProductSummary[]);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "商品列表加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [currentShopId, reloadCount]);

  return { list, error, retry: () => setReloadCount((count) => count + 1) };
}

// 选中商品与 URL 同步：列表加载后校准选中值（URL 参数 → 列表第一项），选中变化写回 ?productId=。
function useSelection(list: ProductSummary[] | null) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (list === null) return;
    const param = searchParams.get("productId");
    if (param && list.some((item) => item.id === param)) {
      setSelectedId(param);
      return;
    }
    setSelectedId(list[0]?.id ?? null);
  }, [list, searchParams]);

  useEffect(() => {
    if (selectedId) router.replace(`/content?productId=${selectedId}`, { scroll: false });
  }, [selectedId, router]);

  return { selectedId, setSelectedId };
}

export default function ContentWorkspace() {
  const { currentShopId } = useShops();
  const { list, error: listError, retry: retryList } = useProducts(currentShopId);
  const { selectedId, setSelectedId } = useSelection(list);
  const [tab, setTab] = useState<ContentTabKey>("ops");
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedStructure, setSelectedStructure] = useState<ContentReferenceView | null>(null);
  const [pendingReview, setPendingReview] = useState<VideoReviewView | null>(null);
  const lastSelectedRef = useRef<string | null>(null);

  // 切换商品（或首次选中）后回到第一个子页；同商品内只选中不清空。
  useEffect(() => {
    if (selectedId !== null && selectedId !== lastSelectedRef.current) {
      lastSelectedRef.current = selectedId;
      setSelectedVideoId(null);
      setSelectedStructure(null);
      setPendingReview(null);
      setTab("ops");
    }
  }, [selectedId]);

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ContentSidebar
        products={list}
        error={listError}
        onRetry={retryList}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-6 py-6">
        <SubTabBar active={tab} onChange={setTab} />
        {selectedId === null && list !== null && list.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            还没有商品可创作。先在「商品」页建档，再回来生成视频脚本与内容。
          </p>
        )}
        {selectedId !== null && (
          <>
            {tab === "ops" && <VideoOpsTab productId={selectedId} onGoToScripts={() => setTab("scripts")} onGoToReview={(videoId) => { setSelectedVideoId(videoId); setTab("review"); }} />}
            {tab === "library" && (
              <ContentLibraryTab productId={selectedId} category={list?.find((item) => item.id === selectedId)?.category ?? null} onUseStructure={(reference) => { setSelectedStructure(reference); setTab("scripts"); }} />
            )}
            {tab === "scripts" && <ScriptLibraryTab productId={selectedId} structure={selectedStructure} review={pendingReview} />}
            {tab === "shots" && <ShotRequirementsTab productId={selectedId} />}
            {tab === "review" && <VideoReviewTab productId={selectedId} initialVideoId={selectedVideoId} onGoToScripts={(review) => { setPendingReview(review); setTab("scripts"); }} />}
          </>
        )}
      </main>
    </div>
  );
}

// 二级子导航条：五个子页切换。
function SubTabBar({ active, onChange }: { active: ContentTabKey; onChange: (tab: ContentTabKey) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
      {TABS.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active === item.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          {item.label}
          {item.sub && <span className={`ml-1 text-xs font-normal ${active === item.key ? "text-blue-100" : "text-gray-400"}`}>({item.sub})</span>}
        </button>
      ))}
    </div>
  );
}
