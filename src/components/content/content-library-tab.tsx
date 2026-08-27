// 用途：内容创作子页②内容库（规格 2.4）：上半部搜词公式与抓取按钮（调用内容运营数据源采集爆款拆解），下半部已沉淀拆解卡片区；
// 「套用此结构写脚本」跳转到子页③脚本库。数据源当前为 Mock，抓取为触发采集并刷新列表。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ProductDnaView } from "@/types";
import type { ContentReferenceView } from "@/types/content";

interface ContentLibraryTabProps {
  productId: string;
  category: string | null;
  onUseStructure: (reference: ContentReferenceView) => void;
}

// 搜词公式：品类/痛点/场景/人群，品类取商品自身类目，其余从 DNA 抽取；DNA 或类目缺失时用通用公式占位。
function buildKeywords(dna: ProductDnaView | null, category: string | null): string[] {
  const pick = (text: string | null | undefined) => text?.split(/[，。,.]/)[0]?.trim() ?? null;
  const persona = pick(dna?.targetPersona);
  const scenario = pick(dna?.useScenarios);
  const points = pick(dna?.coreSellingPoints);
  return [
    category ? `品类: ${category}` : "品类: 灵感商品",
    points ? `痛点: ${points}` : "痛点: 高频困扰",
    scenario ? `场景: ${scenario}` : "场景: 日用场景",
    persona ? `人群: ${persona}` : "人群: 目标受众",
  ];
}

export default function ContentLibraryTab({ productId, category, onUseStructure }: ContentLibraryTabProps) {
  const { currentShopId } = useShops();
  const [references, setReferences] = useState<ContentReferenceView[] | null>(null);
  const [dna, setDna] = useState<ProductDnaView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const loadingRef = useRef(false);
  const collectControllerRef = useRef<AbortController | null>(null);

  // DNA 加载：建关键词公式；失败不阻断内容库（用通用公式）；切换商品/店铺先清空旧值，过期请求作废。
  useEffect(() => {
    if (!currentShopId) return;
    collectControllerRef.current?.abort();
    let stale = false;
    setDna(null);
    apiRequest<{ dna: ProductDnaView | null }>("GET", `/api/products/${productId}/dna?shopId=${currentShopId}`)
      .then((row) => {
        if (!stale) setDna(row.dna);
      })
      .catch(() => {
        if (!stale) setDna(null);
      });
    return () => {
      stale = true;
    };
  }, [productId, currentShopId, reloadCount]);

  // 内容库加载：切换商品/店铺先进入加载态，旧卡片不残留。
  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setReferences(null);
    setError("");
    apiRequest<unknown>("GET", `/api/content/references?productId=${productId}&shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("内容库数据异常");
        setReferences(rows as ContentReferenceView[]);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "内容库加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
      collectControllerRef.current?.abort();
    };
  }, [productId, currentShopId, reloadCount]);

  // 抓取：调用同一数据源重新采集并刷新列表（Mock 下为幂等返回）；ref 同步锁防连点。
  async function handleCollect() {
    if (!currentShopId || loadingRef.current) return;
    collectControllerRef.current?.abort();
    const controller = new AbortController();
    collectControllerRef.current = controller;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const rows = await apiRequest<ContentReferenceView[]>("GET", `/api/content/references?productId=${productId}&shopId=${currentShopId}`, undefined, controller.signal);
      setReferences([]);
      for (const row of rows) {
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(resolve, 180);
          controller.signal.addEventListener("abort", () => {
            window.clearTimeout(timer);
            reject(new DOMException("请求已取消", "AbortError"));
          }, { once: true });
        });
        if (controller.signal.aborted) return;
        setReferences((current) => (current ? [...current, row] : [row]));
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "抓取失败，请重试");
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      if (collectControllerRef.current === controller) collectControllerRef.current = null;
    }
  }

  if (!currentShopId) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="grid gap-5">
      <SearchRadar keywords={buildKeywords(dna, category)} loading={loading} error={error} onCollect={() => void handleCollect()} />
      {error && <ErrorMessage message={error} onRetry={() => setReloadCount((count) => count + 1)} />}
      {references === null && !error && <Loading text="加载内容库…" />}
      {references !== null && !error && references.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          （内容库为空——接入数据源后，抓取到的爆款拆解会沉淀在这里）
        </p>
      )}
      {references !== null && !error && references.length > 0 && (
        <ReferenceLibrary references={references} onUseStructure={onUseStructure} />
      )}
    </div>
  );
}

// 上半部：爆款与热点雷达搜集区（搜词公式 + 抓取按钮）。
function SearchRadar({ keywords, loading, error, onCollect }: { keywords: string[]; loading: boolean; error: string; onCollect: () => void }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
      <h2 className="text-sm font-semibold text-gray-900">🔍 爆款与热点雷达搜集区</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">搜词公式:</span>
        {keywords.map((keyword, index) => (
          <span key={index} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
            [{keyword}]
          </span>
        ))}
        <button
          onClick={onCollect}
          disabled={loading}
          className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "抓取中…" : "🚀 抓取最新视频"}
        </button>
      </div>
      {error === "" && <p className="mt-2 text-xs text-gray-400">对外数据源（爬虫/API）接入前，此处为演示数据；接入后按公式实时采集。</p>}
    </section>
  );
}

// 下半部：已沉淀与逆向拆解的内容库卡片区。
function ReferenceLibrary({ references, onUseStructure }: { references: ContentReferenceView[]; onUseStructure: (reference: ContentReferenceView) => void }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">🗂️ 已经沉淀与逆向拆解的内容库 ({references.length} 个爆款零件)</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {references.map((ref) => (
          <ReferenceCard key={ref.id} reference={ref} onUseStructure={onUseStructure} />
        ))}
      </div>
    </section>
  );
}

function ReferenceCard({ reference, onUseStructure }: { reference: ContentReferenceView; onUseStructure: (reference: ContentReferenceView) => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">爆款 · {reference.angle} · 播放 {reference.playCount.toLocaleString()}</p>
        {reference.conversionRate !== null && <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">转化率 {reference.conversionRate}%</span>}
      </div>
      <ul className="mt-2 grid gap-1 text-xs text-gray-600">
        <li>• <strong>Hook</strong>：{reference.hook}</li>
        <li>• <strong>高频疑问</strong>：{reference.highFrequencyQuestion ?? "（无）"}</li>
        <li>• <strong>CTA 引导</strong>：{reference.cta}</li>
      </ul>
      <button onClick={() => onUseStructure(reference)} className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
        ⚡ 套用此结构写脚本
      </button>
    </div>
  );
}
