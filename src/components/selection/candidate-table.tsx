// 用途：23 列全景数据表格（原型区域 3）：左侧勾选+商品名称固定、右侧操作固定、中间横向滚动；
// 采购成本双击进入行内编辑（非法输入回退）、结果逐条渐入展示、毛利低于阈值高亮、运费 [模拟] 徽标并注明原始币种。
"use client";

import { useEffect, useRef, useState } from "react";
import { CREATOR_COMMISSION_RATE, PLATFORM_FEE_RATE, SELECTION_DEFAULTS, SHIPPING_SIM_NOTE } from "@/config/selection";
import type { SelectionCandidate } from "@/types";

interface CandidateTableProps {
  candidates: SelectionCandidate[];
  highlightThreshold: number | null;
  onToggle: (candidateId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onEditCost: (candidateId: string, costRmb: number) => boolean;
  onKill: (candidateId: string) => void;
  onRestore: (candidateId: string) => void;
  onVideoClick: (candidate: SelectionCandidate) => void;
  onPromote: (candidate: SelectionCandidate) => void;
}

function money(value: number, prefix = "$"): string {
  return `${prefix}${value.toFixed(2)}`;
}

// 表头定义（列序与 23 列规格一致）：区段底色用于区分大盘/精算/利润/投流区域；hint 为悬浮说明；费率文案跟随 config。
const PLATFORM_FEE_HEADER = `平台抽点(${Math.round(PLATFORM_FEE_RATE * 100)}%)`;
const CREATOR_COMM_HEADER = `达人佣金(${Math.round(CREATOR_COMMISSION_RATE * 100)}%)`;
const HEADERS: Array<{ label: string; cls: string; hint?: string }> = [
  { label: "勾选", cls: "sticky left-0 z-10 w-10 bg-slate-100 px-3 py-3 text-center" },
  { label: "商品名称", cls: "sticky left-10 z-10 min-w-[210px] border-r border-gray-200 bg-slate-100 px-3 py-3" },
  { label: "类目", cls: "w-24 px-3 py-3" },
  { label: "月销量", cls: "w-28 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "周增速", cls: "w-24 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "7日大盘GMV", cls: "w-28 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "带货视频数", cls: "w-24 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "关联达人数", cls: "w-24 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "在售店铺数", cls: "w-24 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "好评率 / 评分", cls: "w-24 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "类目转化率 (CR)", cls: "w-28 bg-indigo-50/40 px-3 py-3 text-indigo-900" },
  { label: "拟定售价", cls: "w-24 border-l border-gray-200 px-3 py-3 font-bold" },
  { label: "采购成本 (¥)", cls: "w-36 border-x border-blue-100 bg-blue-50/60 px-3 py-3 font-bold text-blue-900" },
  { label: "重量(g)", cls: "w-20 px-3 py-3" },
  { label: "预估运费", cls: "w-24 px-3 py-3", hint: SHIPPING_SIM_NOTE },
  { label: PLATFORM_FEE_HEADER, cls: "w-24 px-3 py-3" },
  { label: CREATOR_COMM_HEADER, cls: "w-24 px-3 py-3" },
  { label: "单件贡献毛利", cls: "w-24 bg-emerald-50/40 px-3 py-3 font-bold text-emerald-700" },
  { label: "贡献毛利率", cls: "w-24 bg-emerald-50/40 px-3 py-3 font-bold text-emerald-700" },
  { label: "🔥 保本 Max CPA", cls: "w-28 border-r border-rose-100 bg-rose-50/40 px-3 py-3 font-bold text-rose-700" },
  { label: "保本 ROAS", cls: "w-24 px-3 py-3 font-bold" },
  { label: "状态", cls: "w-24 px-3 py-3 text-center" },
  { label: "操作", cls: "sticky right-0 z-10 w-36 border-l border-gray-200 bg-slate-100 px-3 py-3 text-center" },
] as const;

function TableHeader({ allSelected, onToggleAll }: { allSelected: boolean; onToggleAll: (checked: boolean) => void }) {
  return (
    <thead>
      <tr className="bg-slate-100/90 text-[11px] font-semibold text-slate-700">
        {HEADERS.map((header, index) => (
          <th key={header.label} className={header.cls} title={header.hint}>
            {index === 0 ? (
              <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} className="rounded text-blue-600" />
            ) : header.hint ? (
              <span className="underline decoration-dotted">{header.label}</span>
            ) : (
              header.label
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// 成本行内编辑：双击（或 Enter 键）进入，Enter/失焦提交，非法值回退并提示，不提交给父层。
function CostCell({ candidate, onEditCost }: { candidate: SelectionCandidate; onEditCost: CandidateTableProps["onEditCost"] }) {
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = buffer.trim();
    if (trimmed === "") {
      setEditing(false);
      setError("");
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      setError("请输入 0~100000 之间的有效正数");
      inputRef.current?.focus();
      return;
    }
    onEditCost(candidate.candidateId, value);
    setEditing(false);
    setError("");
  }

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          value={buffer}
          onChange={(event) => { setBuffer(event.target.value); setError(""); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") { setEditing(false); setError(""); }
          }}
          onBlur={commit}
          inputMode="decimal"
          className="w-24 rounded border border-amber-400 bg-white px-1 py-0.5 text-xs font-bold text-slate-900 focus:outline-none"
        />
        {error !== "" && <span className="block text-[9px] text-rose-600">{error}</span>}
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={() => { setBuffer(String(candidate.costRmb)); setEditing(true); }}
      onKeyDown={(event) => { if (event.key === "Enter") { setBuffer(String(candidate.costRmb)); setEditing(true); } }}
      title={`双击编辑采购成本（当前 ¥${candidate.costRmb.toFixed(2)}）`}
      className="cursor-text rounded border border-transparent px-2 py-0.5 hover:border-amber-300 hover:bg-amber-50"
    >
      <span className="font-bold text-slate-900">{`¥ ${candidate.costRmb.toFixed(2)}`}</span>
      <span className={`block text-[9px] font-bold ${candidate.sourceTag === "factory" ? "text-indigo-600" : "text-blue-600"}`}>
        {candidate.sourceTag === "factory" ? "自有工厂" : "1688 货源"}
      </span>
    </div>
  );
}

function statusChip(candidate: SelectionCandidate): { text: string; cls: string } {
  if (candidate.status === "建议测品") return { text: "建议测品", cls: "bg-emerald-100 text-emerald-800" };
  if (candidate.status === "候选保留") return { text: "候选保留", cls: "bg-slate-100 text-slate-700" };
  return { text: "已淘汰", cls: "bg-rose-100 text-rose-700" };
}

// 单行渲染：全部 23 列与行内操作。
function CandidateRow({ candidate, highlightThreshold, onToggle, onEditCost, onKill, onRestore, onVideoClick, onPromote }: {
  candidate: SelectionCandidate;
  highlightThreshold: number | null;
  onToggle: (candidateId: string) => void;
  onEditCost: CandidateTableProps["onEditCost"];
  onKill: (candidateId: string) => void;
  onRestore: (candidateId: string) => void;
  onVideoClick: (candidate: SelectionCandidate) => void;
  onPromote: (candidate: SelectionCandidate) => void;
}) {
  const killed = candidate.status === "已淘汰";
  const chip = statusChip(candidate);
  const density = candidate.shopCount < 5 ? { text: `${candidate.shopCount} 家`, cls: "text-blue-600", note: " (蓝海)" } : candidate.shopCount > 30 ? { text: `${candidate.shopCount} 家`, cls: "text-rose-600", note: " (红海)" } : { text: `${candidate.shopCount} 家`, cls: "text-slate-700", note: "" };
  const profitColor = candidate.netProfit <= 0 ? "text-rose-600" : "text-emerald-600";
  return (
    <tr className={`transition-colors hover:bg-gray-50 ${killed ? "bg-gray-50/60 opacity-60" : ""}`}>
      <td className="sticky left-0 z-10 bg-white px-3 py-3 text-center">
        <input type="checkbox" checked={candidate.isSelected} disabled={killed} onChange={() => onToggle(candidate.candidateId)} className="rounded text-blue-600 disabled:text-gray-300" />
      </td>
      <td className="sticky left-10 z-10 border-r border-gray-100 bg-white px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-sm">{candidate.emoji}</span>
          <div>
            <div className={`flex items-center gap-1 text-xs font-bold text-gray-900 ${killed ? "line-through" : ""}`} title={candidate.name}>
              <span className="max-w-[170px] truncate">{candidate.name}</span>
              {candidate.sourceTag === "factory" && <span className="rounded bg-indigo-100 px-1 text-[9px] font-medium text-indigo-700">工厂</span>}
              {candidate.customScript !== undefined && <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700">已套用分镜</span>}
            </div>
            <div className={`max-w-[170px] truncate text-[10px] ${killed ? "text-rose-500" : "text-gray-400"}`}>{candidate.sellingPoint}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">{candidate.category}</span></td>
      <td className="bg-indigo-50/20 px-3 py-3 font-semibold text-gray-800">{candidate.monthlySales.toLocaleString("en-US")} 件</td>
      <td className={`bg-indigo-50/20 px-3 py-3 font-bold ${candidate.weeklyGrowth >= 0 ? "text-emerald-600" : "text-rose-600"}`}>↗ {candidate.weeklyGrowth >= 0 ? "+" : ""}{candidate.weeklyGrowth}%</td>
      <td className="bg-indigo-50/20 px-3 py-3 font-mono text-gray-800">{money(candidate.gmv7d)}</td>
      <td className="bg-indigo-50/20 px-3 py-3 text-gray-700">{candidate.videoCount.toLocaleString("en-US")} 条</td>
      <td className="bg-indigo-50/20 px-3 py-3 text-gray-700">{candidate.creatorCount.toLocaleString("en-US")} 位</td>
      <td className="bg-indigo-50/20 px-3 py-3 text-gray-700"><span className={`font-semibold ${density.cls}`}>{density.text}</span>{density.note}</td>
      <td className="bg-indigo-50/20 px-3 py-3 text-gray-700">{candidate.ratingScore}</td>
      <td className="bg-indigo-50/20 px-3 py-3 font-mono text-emerald-700">{candidate.categoryCr.toFixed(1)}%</td>
      <td className="border-l border-gray-100 px-3 py-3 font-bold text-gray-900">{money(candidate.sellingPrice)}</td>
      <td className="border-x border-blue-100 bg-blue-50/30 px-3 py-3"><CostCell candidate={candidate} onEditCost={onEditCost} /></td>
      <td className="px-3 py-3 text-gray-600">{candidate.weightGrams}g</td>
      <td className="px-3 py-3 text-gray-600" title={SHIPPING_SIM_NOTE}>
        {money(candidate.shippingFee)}
        {candidate.shippingSimulated && <span className="ml-1 rounded bg-gray-100 px-1 text-[9px] text-gray-400">[模拟]</span>}
      </td>
      <td className="px-3 py-3 text-gray-500">{money(candidate.platformFee)}</td>
      <td className="px-3 py-3 text-gray-500" title={candidate.commissionRate === CREATOR_COMMISSION_RATE ? undefined : `当前模拟佣金率 ${(candidate.commissionRate * 100).toFixed(0)}%（默认 ${Math.round(CREATOR_COMMISSION_RATE * 100)}%）`}>{money(candidate.creatorComm)}</td>
      <td className={`bg-emerald-50/30 px-3 py-3 font-bold ${profitColor}`}>{money(candidate.netProfit)}</td>
      <td className="bg-emerald-50/30 px-3 py-3 font-bold text-emerald-700">
        {(candidate.netMarginRate * 100).toFixed(1)}%
        {candidate.netMarginRate < SELECTION_DEFAULTS.lowMarginAlertRate && <span className="ml-0.5 text-amber-500">⚠️</span>}
      </td>
      <td className="border-r border-rose-100 bg-rose-50/30 px-3 py-3 font-bold text-rose-600" style={highlightThreshold !== null && candidate.netMarginRate < highlightThreshold ? { backgroundColor: "rgba(254,226,226,0.8)" } : undefined}>
        {money(candidate.maxCpa)}
      </td>
      <td className="px-3 py-3 font-semibold text-gray-800">{candidate.breakevenRoas.toFixed(2)}</td>
      <td className="px-3 py-3 text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.text}</span></td>
      <td className="sticky right-0 z-10 space-x-1.5 border-l border-gray-100 bg-white px-3 py-3 text-center">
        {killed ? (
          <button type="button" onClick={() => onRestore(candidate.candidateId)} className="text-[11px] font-medium text-blue-600 hover:underline">撤销淘汰</button>
        ) : (
          <>
            <button type="button" onClick={() => onVideoClick(candidate)} className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100">▶ 视频透视</button>
            <button type="button" onClick={() => onPromote(candidate)} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800">推进测品</button>
            <button type="button" onClick={() => onKill(candidate.candidateId)} className="text-[11px] font-medium text-gray-400 hover:text-rose-500">淘汰</button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function CandidateTable(props: CandidateTableProps) {
  const { candidates, highlightThreshold, onToggle, onToggleAll, onEditCost, onKill, onRestore, onVideoClick, onPromote } = props;
  // 结果逐个渐入展示（60ms/条，上限 2 秒）：语义上模拟「收到响应后逐条插入」。
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (candidates.length === 0) return;
    const timer = setInterval(() => {
      setShown((count) => {
        if (count >= candidates.length) {
          clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, 60);
    const clearTimer = window.setTimeout(() => clearInterval(timer), 2000);
    return () => {
      clearInterval(timer);
      clearTimeout(clearTimer);
    };
  }, [candidates]);

  if (candidates.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-700">候选池为空</p>
        <p className="mt-1 text-xs text-gray-400">设置筛选条件后点击「启动选品流水线」，或在顶栏手动添加商品。</p>
      </section>
    );
  }

  const selectable = candidates.filter((candidate) => candidate.status !== "已淘汰");
  const selectedCount = selectable.filter((candidate) => candidate.isSelected).length;
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/50 px-4 py-2 text-xs text-gray-400">
        <span>已显示 {Math.min(shown, candidates.length)} / {candidates.length} 款（逐条插入）</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
          <TableHeader allSelected={allSelected} onToggleAll={onToggleAll} />
          <tbody className="divide-y divide-gray-100">
            {candidates.slice(0, shown).map((candidate) => (
              <CandidateRow
                key={candidate.candidateId}
                candidate={candidate}
                highlightThreshold={highlightThreshold}
                onToggle={onToggle}
                onEditCost={onEditCost}
                onKill={onKill}
                onRestore={onRestore}
                onVideoClick={onVideoClick}
                onPromote={onPromote}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
