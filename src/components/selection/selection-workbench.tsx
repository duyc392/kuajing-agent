// 用途：选品工作台总体编排（原型 /selection）：筛选卡 → 五步加载动画（第五步受真实响应控制）→ 23 列候选表（逐条渐入展示）
// → 视频透视弹窗 → 推进测品确认与三态结果；页面状态全部来自 SelectionContext（沙盒），本组件只做展示与事件分发。
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SelectionFilters from "@/components/selection/selection-filters";
import CandidateTable from "@/components/selection/candidate-table";
import VideoDeconstructionModal from "@/components/selection/video-deconstruction-modal";
import { SELECTION_UI_FEEDBACK_EVENT, useSelection } from "@/components/selection/selection-context";
import type { GenerateDraftScriptResult, SelectionCandidate, SelectionFilterParams } from "@/types";

const PIPELINE_STEPS = [
  { label: "1.大盘抓取", text: "正在抓取大盘飙升榜..." },
  { label: "2.侵权筛查", text: "正在过滤侵权与基础硬指标..." },
  { label: "3.成本查询", text: "正在查询采购底价与运费..." },
  { label: "4.利润计算", text: "正在计算单件利润与 Max CPA..." },
  { label: "5.生成表格", text: "等待响应完成…" },
];

// 五步加载动画：前四步按节奏推进，第五步（生成表格）必须等真实响应完成才点亮；失败立即停止并允许重试。
function PipelineProgressSection({ running, done, failed, error, onRetry }: { running: boolean; done: boolean; failed: boolean; error: string; onRetry: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!running) return;
    setStepIndex(0);
    const timer = setInterval(() => {
      setStepIndex((index) => (index < PIPELINE_STEPS.length - 2 ? index + 1 : index));
    }, 500);
    return () => clearInterval(timer);
  }, [running]);

  const visibleSteps = failed
    ? Math.max(stepIndex + 1, 1)
    : done
      ? PIPELINE_STEPS.length
      : Math.min(Math.max(stepIndex + (running ? 1 : 0), 1), PIPELINE_STEPS.length);
  const current = failed ? "选品流水线运行失败" : done ? "完成！已更新选品分析表。" : PIPELINE_STEPS[Math.min(stepIndex, PIPELINE_STEPS.length - 2)].text;

  if (!running && !done && !failed) return null;
  return (
    <section className={`page-card p-4 ${failed ? "border-red-200" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${failed ? "bg-red-500" : "bg-[#41876d]"} ${running ? "animate-pulse" : ""}`}></span>
          <span className="text-xs font-bold tracking-wide">{current}</span>
        </div>
        {failed && (
          <button type="button" onClick={onRetry} className="btn btn-primary btn-sm">重试</button>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e5ece8]">
        <div className={`h-full transition-all duration-500 ${failed ? "bg-red-500" : "bg-[#41876d]"}`} style={{ width: `${(visibleSteps / 5) * 100}%` }} />
      </div>
      {failed && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 grid grid-cols-5 gap-2 pt-1 text-[11px] text-[var(--workspace-muted)]">
        {PIPELINE_STEPS.map((step, index) => {
          const isErrorStep = failed && index === visibleSteps - 1;
          const isSuccessStep = !failed && index < visibleSteps;
          return (
            <div
              key={step.label}
              className={`flex items-center gap-1 ${
                isErrorStep ? "font-semibold text-red-500" : isSuccessStep ? "font-semibold text-[#2e6350]" : ""
              }`}
            >
              <span>{isErrorStep ? "✗" : isSuccessStep ? "✓" : "○"}</span> {step.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function SelectionWorkbench() {
  const { shopId, scratchpad, running, runError, runPipeline, updateCandidateCost, toggleCandidate, toggleAll, killCandidate, restoreCandidate, addManualCandidate, applyCustomScript, promoteCandidates, highlightThreshold } = useSelection();
  const [lastFilters, setLastFilters] = useState<SelectionFilterParams | null>(null);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [videoCandidate, setVideoCandidate] = useState<SelectionCandidate | null>(null);
  const [confirmCandidates, setConfirmCandidates] = useState<SelectionCandidate[] | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{ promoted: number; failed: string[] } | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);

  const showToast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // Agent 指令执行结果反馈：Provider 消费队列后经事件广播，这里展示 toast。
  useEffect(() => {
    const onFeedback = (event: Event) => showToast((event as CustomEvent<string>).detail);
    window.addEventListener(SELECTION_UI_FEEDBACK_EVENT, onFeedback);
    return () => window.removeEventListener(SELECTION_UI_FEEDBACK_EVENT, onFeedback);
  }, [showToast]);

  function startPipeline(filters: SelectionFilterParams) {
    setLastFilters(filters);
    setPipelineDone(false);
    runPipeline(filters)
      .then(() => {
        setPipelineDone(true);
        showToast("选品扫描完成");
      })
      .catch((error: unknown) => {
        // SPEC 4.1 步骤 6：失败立即停止动画并以 Toast 报可读错误（面板保留错误详情与重试按钮；中止请求不提示）。
        const message = error instanceof Error ? error.message : "";
        if (message !== "") showToast(message, "error");
      });
  }

  function handleEditCost(candidateId: string, costRmb: number): boolean {
    const ok = updateCandidateCost(candidateId, costRmb);
    if (ok) showToast(`已更新采购成本为 ¥${costRmb.toFixed(2)}，整行已重算`);
    return ok;
  }

  const selected = (scratchpad?.candidates ?? []).filter((candidate) => candidate.isSelected && candidate.status !== "已淘汰");

  async function runConfirmedPromote(candidates: SelectionCandidate[]) {
    setPromoting(true);
    try {
      const { promoted, failed } = await promoteCandidates(candidates.map((candidate) => candidate.candidateId));
      setPromoteResult({ promoted: promoted.length, failed });
      setConfirmCandidates(null);
    } finally {
      setPromoting(false);
    }
  }

  const visibleCandidates = scratchpad?.candidates ?? [];

  return (
    <div className="page-shell mx-auto max-w-[1720px] !px-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">选品调研</h1>
          <p className="page-subtitle">先看数据，再做选择。</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-agent-drawer"))} className="btn btn-outline">
            <span className="text-[13px]">✦</span>Agent 助手
          </button>
        </div>
      </header>
      <div className="grid gap-5">
        <SelectionFilters disabled={running} onRun={startPipeline} />
      <PipelineProgressSection running={running} done={pipelineDone} failed={runError !== ""} error={runError} onRetry={() => { if (lastFilters) startPipeline(lastFilters); }} />

      <TableToolbar
        count={visibleCandidates.length}
        selectedCount={selected.length}
        promoting={promoting}
        onPromote={() => setConfirmCandidates(selected)}
        onSubmitManual={(input) => { addManualCandidate(input); showToast("已添加候选品并重算"); }}
      />

      <CandidateTable candidates={visibleCandidates} highlightThreshold={highlightThreshold} onToggle={toggleCandidate} onToggleAll={toggleAll} onEditCost={handleEditCost} onKill={killCandidate} onRestore={restoreCandidate} onVideoClick={setVideoCandidate} onPromote={(candidate) => setConfirmCandidates([candidate])} />

      <SelectionDialogs
        shopId={shopId}
        videoCandidate={videoCandidate}
        confirmCandidates={confirmCandidates}
        promoteResult={promoteResult}
        promoting={promoting}
        toast={toast}
        onCloseVideo={() => setVideoCandidate(null)}
        onApplyScript={(candidateId, script) => { applyCustomScript(candidateId, script); showToast("已套用分镜，临时脚本将随推进一起入库"); }}
        onCloseConfirm={() => setConfirmCandidates(null)}
        onConfirmPromote={(candidates) => { void runConfirmedPromote(candidates); }}
        onCloseResult={() => setPromoteResult(null)}
      />
      </div>
    </div>
  );
}

// 弹窗与提示组合：视频透视、推进确认、推进结果、Toast 的条件渲染，参数全部来自工作台状态。
function SelectionDialogs(props: {
  shopId: string | null;
  videoCandidate: SelectionCandidate | null;
  confirmCandidates: SelectionCandidate[] | null;
  promoteResult: { promoted: number; failed: string[] } | null;
  promoting: boolean;
  toast: { message: string; tone: "ok" | "error" } | null;
  onCloseVideo: () => void;
  onApplyScript: (candidateId: string, script: GenerateDraftScriptResult["script"]) => void;
  onCloseConfirm: () => void;
  onConfirmPromote: (candidates: SelectionCandidate[]) => void;
  onCloseResult: () => void;
}) {
  const { shopId, videoCandidate, confirmCandidates, promoteResult, promoting, toast } = props;
  return (
    <>
      {videoCandidate !== null && (
        <VideoDeconstructionModal
          candidate={videoCandidate}
          shopId={shopId}
          onClose={props.onCloseVideo}
          onApply={props.onApplyScript}
        />
      )}
      {confirmCandidates !== null && (
        <PromoteConfirmModal candidates={confirmCandidates} promoting={promoting} onCancel={props.onCloseConfirm} onConfirm={() => props.onConfirmPromote(confirmCandidates)} />
      )}
      {promoteResult !== null && <PromoteResultModal result={promoteResult} onClose={props.onCloseResult} />}
      {toast !== null && (
        <div className={`fixed left-1/2 top-5 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-white shadow-lg ${toast.tone === "ok" ? "bg-[#21312d]" : "bg-red-600"}`}>
          <span className={toast.tone === "ok" ? "text-[#78c7ad]" : "text-red-100"}>{toast.tone === "ok" ? "✓" : "✕"}</span> {toast.message}
        </div>
      )}
    </>
  );
}

// 表格顶栏：候选数、手动添加（本地表单收集 → 候选重算）、推进按钮与选中计数。
function TableToolbar({ count, selectedCount, promoting, onPromote, onSubmitManual }: { count: number; selectedCount: number; promoting: boolean; onPromote: () => void; onSubmitManual: (input: ManualCandidateInput) => void }) {
  return (
    <section className="page-card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold">候选商品</h2>
        <span className="status-pill">{count} 款候选品</span>
      </div>
      <div className="flex items-center gap-2.5">
        <ManualAddButton onSubmit={onSubmitManual} />
        <button
          type="button"
          disabled={selectedCount === 0 || promoting}
          onClick={onPromote}
          className="btn btn-primary btn-sm"
        >
          推进至测品池 <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">{selectedCount}</span>
        </button>
      </div>
    </section>
  );
}

interface ManualCandidateInput {
  name: string;
  category: string;
  sellingPrice: number;
  costRmb: number;
  weightGrams: number;
}

// 手动添加商品：表单客户端校验（必填/正数），提交后交给沙盒重算并进入候选池。
function ManualAddButton({ onSubmit }: { onSubmit: (input: ManualCandidateInput) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("家居厨房");
  const [sellingPrice, setSellingPrice] = useState("19.99");
  const [costRmb, setCostRmb] = useState("9.50");
  const [weightGrams, setWeightGrams] = useState("200");
  const [error, setError] = useState("");

  function submit() {
    const price = Number(sellingPrice);
    const cost = Number(costRmb);
    const weight = Number(weightGrams);
    if (name.trim() === "") { setError("请输入商品名称"); return; }
    if (!Number.isFinite(price) || price <= 0) { setError("售价必须为正数"); return; }
    if (!Number.isFinite(cost) || cost < 0) { setError("采购成本不能为负数"); return; }
    if (!Number.isFinite(weight) || weight <= 0) { setError("重量必须为正数"); return; }
    onSubmit({ name: name.trim(), category, sellingPrice: price, costRmb: cost, weightGrams: weight });
    setOpen(false);
    setError("");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-outline btn-sm">
        ＋ 手动添加商品
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-bold">手动添加商品</h3>
            <p className="mt-1 text-[11px] text-[var(--workspace-muted)]">添加后按当前筛选规则自动计算利润与 Max CPA，可双击采购成本调价。</p>
            <FieldRow label="商品名称"><input value={name} onChange={(event) => setName(event.target.value)} className="field-input" placeholder="如 多功能磁吸浴室置物架" /></FieldRow>
            <FieldRow label="类目"><input value={category} onChange={(event) => setCategory(event.target.value)} className="field-input" /></FieldRow>
            <div className="grid grid-cols-3 gap-3">
              <FieldRow label="拟定售价 ($)"><input value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} inputMode="decimal" className="field-input" /></FieldRow>
              <FieldRow label="采购成本 (¥)"><input value={costRmb} onChange={(event) => setCostRmb(event.target.value)} inputMode="decimal" className="field-input" /></FieldRow>
              <FieldRow label="重量 (g)"><input value={weightGrams} onChange={(event) => setWeightGrams(event.target.value)} inputMode="numeric" className="field-input" /></FieldRow>
            </div>
            {error !== "" && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-outline btn-sm">取消</button>
              <button type="button" onClick={submit} className="btn btn-primary btn-sm">添加并重算</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium text-[var(--workspace-muted)]">{label}</span>
      {children}
    </label>
  );
}

// 推进确认弹窗（SPEC 4.1 步骤 20）：列出商品与正式写入内容，确认后才提交（同时为三层去重的前端防抖层）。
function PromoteConfirmModal({ candidates, promoting, onCancel, onConfirm }: { candidates: SelectionCandidate[]; promoting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-sm font-bold text-gray-900">确认推进 {candidates.length} 款商品进入测品池？</h3>
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          {candidates.map((candidate) => (
            <li key={candidate.candidateId} className="flex items-center justify-between">
              <span className="truncate">{candidate.name}</span>
              <span className="shrink-0 pl-2 text-gray-400">{candidate.sellingPoint}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-700">
          <p className="font-semibold">正式写入的内容（事务原子提交）：</p>
          <p className="mt-1">• 商品档案（标记 🟡 测品中）与商品 DNA</p>
          <p>• 测试分镜脚本 3 篇（未套用分镜时先由 Agent 生成 1 条真实脚本）+ 拍摄需求看板</p>
          <p className="mt-1 text-gray-400">过程不可逆？可点击「撤销淘汰」恢复原候选。</p>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={promoting} className="btn btn-outline btn-sm">取消</button>
          <button type="button" onClick={onConfirm} disabled={promoting} className="btn btn-primary btn-sm">
            {promoting ? "推进中…" : "确认推进"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 推进结果三态：全部成功 / 部分成功 / 全部失败（失败时不给绿色成功反馈）。
function PromoteResultModal({ result, onClose }: { result: { promoted: number; failed: string[] }; onClose: () => void }) {
  const allOk = result.failed.length === 0;
  const noneOk = result.promoted === 0;
  const tone = allOk ? "bg-emerald-100 text-emerald-600" : noneOk ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600";
  const title = allOk ? `已成功推进 ${result.promoted} 款商品进入【测品池】` : noneOk ? "推进失败，请检查失败原因后重试" : `部分成功：${result.promoted} 款成功，${result.failed.length} 款失败`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${tone}`}>{allOk ? "✓" : noneOk ? "✕" : "⚠"}</span>
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">{allOk ? "商品已建档案并标记为 🟡 测品中" : noneOk ? "未创建任何正式数据" : "成功的商品已入库，失败的商品保留在候选池"}</p>
          </div>
        </div>
        {allOk && (
          <div className="mt-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-700">
            <p className="flex items-center gap-2"><span className="text-emerald-500">✓</span> 已在【商品管理】建立商品档案，生成商品 DNA</p>
            <p className="flex items-center gap-2"><span className="text-emerald-500">✓</span> 已生成测试分镜脚本（3 篇）与拍摄看板</p>
          </div>
        )}
        {result.failed.length > 0 && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <p className="font-semibold">失败原因：</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">{result.failed.map((message) => <li key={message}>{message}</li>)}</ul>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200">留在此页</button>
          {allOk && (
            <Link href="/content" className="flex items-center gap-1.5 rounded-lg bg-[var(--workspace-primary)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#315647]">
              前往内容创作工坊 →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
