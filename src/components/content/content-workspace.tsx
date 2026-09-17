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

const TABS: { key: ContentTabKey; label: string }[] = [
  { key: "ops", label: "视频运营" },
  { key: "library", label: "内容库" },
  { key: "scripts", label: "脚本库" },
  { key: "shots", label: "素材需求" },
  { key: "review", label: "数据复盘" },
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
    return <p className="p-10 text-center text-sm text-[var(--workspace-muted)]">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1 className="page-title">内容创作</h1>
          <p className="page-subtitle">围绕商品持续生产视频与直播内容。</p>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ContentSidebar
          products={list}
          error={listError}
          onRetry={retryList}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <main className="grid min-w-0 gap-4">
          <SubTabBar active={tab} onChange={setTab} />
          {selectedId === null && list !== null && list.length === 0 && (
            <p className="page-card border-dashed p-8 text-center text-sm text-[var(--workspace-muted)]">
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
    </div>
  );
}

// 二级子导航条：五个子页切换（浅绿胶囊激活态，与顶栏激活线区分为两级不同的指示方式）。
function SubTabBar({ active, onChange }: { active: ContentTabKey; onChange: (tab: ContentTabKey) => void }) {
  return (
    <nav className="subnav" aria-label="内容创作子页">
      {TABS.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          aria-current={active === item.key ? "page" : undefined}
          className="subnav-link"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
