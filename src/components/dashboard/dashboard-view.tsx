// 用途：数据看板主视图（PRD 故事 31）：店铺名查询 + 时间范围选择；展示 GMV/销量/评分/视频数/视频转化率指标卡、
// GMV 与销量趋势、流量来源与销售渠道占比、内容表现与类目表现。数据来自 FastMoss 实时查询，不落库。
"use client";

import { useRef, useState } from "react";
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
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

// 指标卡区：GMV、销量、店铺评分、关联视频数、视频转化率（销量 ÷ 播放量，代码计算）。
function SummaryCards({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
        className="min-w-64 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="TikTok 店铺名称，如 medicube US Store"
        value={shopName}
        maxLength={200}
        onChange={(event) => onShopNameChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") onQuery(); }}
      />
      <select className="rounded-lg border border-gray-300 px-2 py-2 text-sm" value={timeRange} onChange={(event) => onTimeRangeChange(event.target.value)}>
        {TIME_RANGES.map((range) => (
          <option key={range.value} value={range.value}>{range.label}</option>
        ))}
      </select>
      <button onClick={onQuery} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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
        <h2 className="text-base font-semibold text-gray-900">{data.shopName}</h2>
        <p className="text-xs text-gray-400">地区 {data.region} · 数据周期为 FastMoss 已结算周期{data.timeRangeDays > 30 ? " · 趋势图按周期均匀采样 30 点" : ""}</p>
      </div>
      <TrendChart title="GMV 趋势（美元）" points={data.trend.map((point) => ({ date: point.date, value: point.gmv }))} format={formatCompactMoney} color="#3b82f6" />
      <TrendChart title="销量趋势（件）" points={data.trend.map((point) => ({ date: point.date, value: point.unitsSold }))} format={formatCompactNumber} color="#10b981" />
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

// 查询状态与提交：店铺名/时间范围输入、结果/错误/加载三态，loadingRef 防连点（查询消耗 FastMoss 额度）。
function useDashboardQuery(currentShopId: string | null) {
  const [shopName, setShopName] = useState("");
  const [timeRange, setTimeRange] = useState("28");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  async function query() {
    if (!currentShopId || loadingRef.current) return;
    if (shopName.trim() === "") {
      setError("请输入要查询的 TikTok 店铺名称");
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await apiRequest<unknown>("GET", `/api/dashboard?shopId=${currentShopId}&shopName=${encodeURIComponent(shopName.trim())}&timeRangeDays=${timeRange}`);
      if (typeof result !== "object" || result === null) throw new Error("看板数据异常");
      setData(result as DashboardData);
    } catch (e) {
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
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">数据看板</h1>
        <p className="mt-1 text-sm text-gray-500">输入 TikTok 店铺名称，实时查询该店铺的经营数据（数据来自 FastMoss，不落库保存）。</p>
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
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          输入店铺名称开始查询。当前工作台店铺的市场会决定查询地域。
        </p>
      )}
      {data && <DashboardSections data={data} />}
    </div>
  );
}
