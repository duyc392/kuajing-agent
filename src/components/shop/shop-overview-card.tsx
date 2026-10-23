// 用途：工作台主区当前店铺概览卡：名称 / 市场 / 简述 + 商品与对话统计，切换店铺后全部跟随刷新。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import type { ConversationSummary } from "@/types";

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f0f4f1] px-4 py-3 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--workspace-muted)]">{label}</p>
    </div>
  );
}

export default function ShopOverviewCard() {
  const { currentShopId, shops } = useShops();
  const current = shops.find((shop) => shop.id === currentShopId) ?? null;
  const [conversationCount, setConversationCount] = useState<number | null>(null);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    setConversationCount(null);
    apiRequest<ConversationSummary[]>("GET", `/api/conversations?shopId=${currentShopId}`)
      .then((list) => { if (!stale) setConversationCount(list.length); })
      .catch(() => { if (!stale) setConversationCount(-1); });
    return () => { stale = true; };
  }, [currentShopId]);

  if (!current) {
    return <p className="text-sm text-[var(--workspace-muted)]">尚无当前店铺，请先创建店铺。</p>;
  }

  return (
    <section className="page-card w-full max-w-md p-6 text-left">
      <h1 className="text-lg font-bold">{current.name}</h1>
      <p className="mt-1 text-xs text-[var(--workspace-muted)]">{current.market}</p>
      {current.description && <p className="mt-3 text-sm text-[#3b534c]">{current.description}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatBlock label="商品" value={String(current.productCount)} />
        <StatBlock label="对话" value={conversationCount === null ? "…" : conversationCount < 0 ? "—" : String(conversationCount)} />
      </div>
      <p className="mt-4 text-xs text-[var(--workspace-muted)]">从左侧选择一个对话，或点击「新建对话」开始。</p>
    </section>
  );
}
