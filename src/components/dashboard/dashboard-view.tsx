// 用途：数据看板主视图（PRD 故事 31）：店铺名查询 + 时间范围选择；展示 GMV/销量/评分/视频数/视频转化率指标卡、
// GMV 与销量趋势、流量来源与销售渠道占比、内容表现与类目表现。数据来自 FastMoss 实时查询，不落库。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { formatCompactMoney, formatCompactNumber, formatPercent } from "@/lib/numbers";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import TrendChart from "@/components/dashboard/trend-chart";
import DonutChart from "@/components/dashboard/donut-chart";
import { CategoryPerformance, ContentPerformance } from "@/components/dashboard/top-lists";
import type { DashboardData } from "@/types";

const TIME_RANGES = [
  { value: "7", label: "近 7 天" },
  { value: "28", label: "近 28 天" },
  { value: "90", label: "近 90 天" },
];

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="px-4 py-4 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-[var(--workspace-border)]">
      <p className="text-xs text-[var(--workspace-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-xs text-[var(--workspace-muted)]">{note}</p>}
    </div>
  );
}

// 指标卡区：GMV、销量、店铺评分、关联视频数、视频转化率（销量 ÷ 播放量，代码计算）；单卡内竖线分列。
function SummaryCards({ data }: { data: DashboardData }) {
  return (
    <div className="page-card grid grid-cols-2 sm:grid-cols-5">
      <MetricCard label={`GMV（近 ${data.timeRangeDays} 天）`} value={formatCompactMoney(data.gmv)} />
      <MetricCard label={`订单量（近 ${data.timeRangeDays} 天）`} value={formatCompactNumber(data.unitsSold)} note="FastMoss 无订单数，按销量口径统计" />
      <MetricCard label="店铺评分" value={data.rating !== null ? data.rating.toFixed(1) : "—"} />
      <MetricCard label="关联视频数" value={formatCompactNumber(data.videoCount)} />
      <MetricCard label="视频转化率（Top 内容）" value={formatPercent(data.videoConversionRatePercent)} note="销量 ÷ 播放量" />
    </div>
  );
}

// 查询表单：店铺名输入 + 时间范围下拉 + 查询按钮。
function QueryForm({ shopName, timeRange, loading, onShopNameChange, onTimeRangeChange, onQuery }: {
  shopName: string;
  timeRange: string;
  loading: boolean;
  onShopNameChange: (value: string) => void;
  onTimeRangeChange: (value: string) => void;
  onQuery: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="field-input min-w-64 flex-1"
        placeholder="TikTok 店铺名称，如 medicube US Store"
        value={shopName}
        maxLength={200}
        onChange={(event) => onShopNameChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") onQuery(); }}
      />
      <select className="field-input w-auto" value={timeRange} onChange={(event) => onTimeRangeChange(event.target.value)}>
        {TIME_RANGES.map((range) => (
          <option key={range.value} value={range.value}>{range.label}</option>
        ))}
      </select>
      <button onClick={onQuery} disabled={loading} className="btn btn-primary">
        {loading ? "查询中…" : "查询"}
      </button>
    </div>
  );
}

// 结果区：指标卡 + 双趋势 + 双占比环 + 双列表。
function DashboardSections({ data }: { data: DashboardData }) {
  return (
    <>
      <SummaryCards data={data} />
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{data.shopName}</h2>
        <p className="text-xs text-[var(--workspace-muted)]">地区 {data.region} · 数据周期为 FastMoss 已结算周期{data.timeRangeDays > 30 ? " · 趋势图按周期均匀采样 30 点" : ""}</p>
      </div>
      <TrendChart title="GMV 趋势（美元）" points={data.trend.map((point) => ({ date: point.date, value: point.gmv }))} format={formatCompactMoney} color="#21312d" />
      <TrendChart title="销量趋势（件）" points={data.trend.map((point) => ({ date: point.date, value: point.unitsSold }))} format={formatCompactNumber} color="#78c7ad" />
      <div className="grid gap-3 sm:grid-cols-2">
        <DonutChart title="流量来源（GMV 占比）" items={data.contentChannels} />
        <DonutChart title="销售渠道（GMV 占比）" items={data.salesChannels} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ContentPerformance items={data.topContents} />
        <CategoryPerformance items={data.categories} />
      </div>
    </>
  );
}

// 查询状态与提交：店铺名/时间范围输入、结果/错误/加载三态，loadingRef 防连点（查询消耗 FastMoss 额度）；
// 响应绑定发起时的店铺（迟到响应不跨店落盘），切店清空旧店结果，维护店铺上下文隔离。
function useDashboardQuery(currentShopId: string | null) {
  const [shopName, setShopName] = useState("");
  const [timeRange, setTimeRange] = useState("28");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const shopRef = useRef(currentShopId);
  shopRef.current = currentShopId;

  // 切店清空：旧店的结果与错误不得出现在新店界面。
  useEffect(() => {
    setData(null);
    setError("");
  }, [currentShopId]);

  async function query() {
    if (!currentShopId || loadingRef.current) return;
    if (shopName.trim() === "") {
      setError("请输入要查询的 TikTok 店铺名称");
      return;
    }
    const requestShop = currentShopId;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await apiRequest<unknown>("GET", `/api/dashboard?shopId=${requestShop}&shopName=${encodeURIComponent(shopName.trim())}&timeRangeDays=${timeRange}`);
      if (shopRef.current !== requestShop) return; // 店铺已切换：丢弃旧店迟到响应
      if (typeof result !== "object" || result === null) throw new Error("看板数据异常");
      setData(result as DashboardData);
    } catch (e) {
      if (shopRef.current !== requestShop) return;
      setError(e instanceof Error ? e.message : "看板查询失败，请重试");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  return { shopName, setShopName, timeRange, setTimeRange, data, error, loading, query };
}

export default function DashboardView() {
  const { currentShopId } = useShops();
  const { shopName, setShopName, timeRange, setTimeRange, data, error, loading, query } = useDashboardQuery(currentShopId);

  return (
    <div className="page-shell mx-auto grid max-w-6xl gap-4">
      <header className="page-header">
        <div>
          <h1 className="page-title">数据看板</h1>
          <p className="page-subtitle">看清变化，再决定下一步。数据来自 FastMoss 实时查询，不落库保存。</p>
        </div>
      </header>
      <QueryForm
        shopName={shopName}
        timeRange={timeRange}
        loading={loading}
        onShopNameChange={setShopName}
        onTimeRangeChange={setTimeRange}
        onQuery={() => void query()}
      />
      {error && <ErrorMessage message={error} onRetry={() => void query()} />}
      {loading && !data && <Loading text="正在查询 FastMoss 数据…" />}
      {!loading && !data && !error && (
        <p className="page-card border-dashed p-8 text-center text-sm text-[var(--workspace-muted)]">
          输入店铺名称开始查询。当前工作台店铺的市场会决定查询地域。
        </p>
      )}
      {data && <DashboardSections data={data} />}
    </div>
  );
}
