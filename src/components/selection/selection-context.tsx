// 用途：选品沙盒状态层（SPEC 5.2 / 7.2）：候选池按 shopId 存 localStorage，切换店铺自动加载；任何修改都只改沙盒不写数据库；
// 成本/佣金修改用财务纯函数 0ms 重算整行；推进测品调用 REST API 后从沙盒移除；Agent 结构化指令经 localStorage 队列消费（页面没开也不丢）。
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiRequest } from "@/lib/api-client";
import { computeDefaultFinance, refineStatusOf } from "@/config/selection";
import { buildManualCandidate } from "@/lib/selection-manual-candidate";
import { scratchpadSchema, selectionCandidateSchema } from "@/lib/selection-schemas";
import { useShops } from "@/components/shop/shop-context";
import type { PromoteSelectionResult, RunSelectionResult, SelectionCandidate, SelectionDraftScript, SelectionFilterParams, SelectionScratchpad, SelectionUiAction } from "@/types";

const SCRATCH_KEY_PREFIX = "selection-scratchpad:";
const SUMMARY_KEY_PREFIX = "selection-summary:";
const UI_QUEUE_KEY = "selection-ui-queue";

export const SELECTION_POOL_CHANGED_EVENT = "selection-pool-changed";
// Agent 工具指令队列：卡片入队后广播，页面 Provider 消费（队列持久化，页面未打开指令不丢失）。
export const SELECTION_UI_QUEUE_EVENT = "selection-ui-queue-changed";
// 队列执行结果反馈（toast 文案），由 workbench 监听展示。
export const SELECTION_UI_FEEDBACK_EVENT = "selection-ui-feedback";

// ================= localStorage 安全访问（配额拒绝/损坏不阻断页面） =================

function safeGetRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`[selection] localStorage 读取失败（${key}）`, error);
    return null;
  }
}

function safeSetRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[selection] localStorage 写入失败（${key}）`, error);
  }
}

function safeRemoveRaw(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[selection] localStorage 删除失败（${key}）`, error);
  }
}

// ================= 队列：Agent 指令先持久化再广播，消费按店铺过滤 =================

interface QueuedUiAction {
  id: string;
  shopId: string;
  action: SelectionUiAction;
}

function readQueue(): QueuedUiAction[] {
  const raw = safeGetRaw(UI_QUEUE_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedUiAction =>
        typeof item === "object" && item !== null
        && typeof (item as QueuedUiAction).id === "string"
        && typeof (item as QueuedUiAction).shopId === "string"
        && typeof (item as QueuedUiAction).action?.type === "string",
    );
  } catch {
    safeRemoveRaw(UI_QUEUE_KEY);
    return [];
  }
}

function writeQueue(queue: QueuedUiAction[]): void {
  if (queue.length === 0) {
    safeRemoveRaw(UI_QUEUE_KEY);
    return;
  }
  safeSetRaw(UI_QUEUE_KEY, JSON.stringify(queue));
}

// Agent 指令入队（工具卡调用）：当前对话店铺的候选操作指令，页面未打开时保留等待消费。
export function enqueueUiAction(shopId: string, action: SelectionUiAction): void {
  const queue = readQueue();
  queue.push({ id: `${Date.now()}-${queue.length}`, shopId, action });
  writeQueue(queue);
  window.dispatchEvent(new CustomEvent(SELECTION_UI_QUEUE_EVENT));
}

// ================= 选品摘要（供 Agent 对话引用） =================

function summaryLine(candidate: SelectionCandidate): string {
  return `[ID:${candidate.candidateId}] ${candidate.name}｜售价$${candidate.sellingPrice.toFixed(2)}｜净利$${candidate.netProfit.toFixed(2)}｜毛利${(candidate.netMarginRate * 100).toFixed(1)}%｜状态:${candidate.status}`;
}

// 沙盒里当前候选的文本摘要：聊天客户端读取后附到消息中，让 Agent 说得准（SPEC 7.2「传递选品摘要」）。
export function readSelectionSummary(shopId: string): string | null {
  return safeGetRaw(`${SUMMARY_KEY_PREFIX}${shopId}`);
}

function writeSelectionSummary(shopId: string, candidates: SelectionCandidate[]): void {
  const summary = candidates.slice(0, 20).map(summaryLine).join("\n");
  if (summary === "") {
    safeRemoveRaw(`${SUMMARY_KEY_PREFIX}${shopId}`);
    return;
  }
  safeSetRaw(`${SUMMARY_KEY_PREFIX}${shopId}`, summary);
}

function storageKey(shopId: string): string {
  return `${SCRATCH_KEY_PREFIX}${shopId}`;
}

// 读取本地沙盒：zod 校验；版本不匹配或解析失败安全清空；单个候选异常容错过滤，绝不白屏。
export function loadScratchpad(shopId: string): SelectionScratchpad | null {
  const raw = safeGetRaw(storageKey(shopId));
  if (raw === null) return null;
  try {
    const rawObj = JSON.parse(raw);
    const parsed = scratchpadSchema.safeParse(rawObj);
    if (parsed.success && parsed.data.version === 1 && parsed.data.shopId === shopId) {
      return parsed.data;
    }
    // 容错降级：如果基础结构有效（版本1且shopId正确），尝试保留有效候选品，避免整批丢失
    if (rawObj && typeof rawObj === "object" && rawObj.version === 1 && rawObj.shopId === shopId && Array.isArray(rawObj.candidates)) {
      const validCandidates: SelectionCandidate[] = [];
      for (const item of rawObj.candidates) {
        const itemParsed = selectionCandidateSchema.safeParse(item);
        if (itemParsed.success) {
          validCandidates.push(itemParsed.data);
        }
      }
      if (validCandidates.length > 0) {
        return {
          version: 1,
          shopId,
          filters: rawObj.filters ?? { targetRegion: "US", targetCategory: "美妆个护", priceRange: { min: 10, max: 50 }, minMarginRate: 0.45, maxWeightGrams: 500, isProhibitedGoodsExcluded: true },
          candidates: validCandidates,
          generatedAt: typeof rawObj.generatedAt === "string" ? rawObj.generatedAt : new Date().toISOString(),
          updatedAt: typeof rawObj.updatedAt === "string" ? rawObj.updatedAt : new Date().toISOString(),
        };
      }
    }
    console.warn("[selection] 本地选品草稿校验失败且无法恢复，已安全清空", parsed.success ? `shopId=${parsed.data.shopId}` : parsed.error.issues.map((issue) => issue.path.join(".")).join(","));
    safeRemoveRaw(storageKey(shopId));
    return null;
  } catch (error) {
    console.warn("[selection] 本地选品草稿读取失败，已安全清空", error);
    safeRemoveRaw(storageKey(shopId));
    return null;
  }
}

// ================= 候选重算（与 service 同公式，纯前端 0ms 重算） =================

function recalcCandidate(candidate: SelectionCandidate): SelectionCandidate {
  const finance = computeDefaultFinance({
    region: candidate.targetRegion,
    sellingPrice: candidate.sellingPrice,
    costRmb: candidate.costRmb,
    weightGrams: candidate.weightGrams,
    commissionRate: candidate.commissionRate,
  });
  const status = refineStatusOf({ netProfit: finance.netProfit, netMarginRate: finance.netMarginRate, weeklyGrowth: candidate.weeklyGrowth });
  return {
    ...candidate,
    shippingFee: finance.shippingFee,
    shippingSimulated: candidate.targetRegion !== "US",
    platformFee: finance.platformFee,
    creatorComm: finance.creatorComm,
    refundReserve: finance.refundReserve,
    netProfit: finance.netProfit,
    netMarginRate: finance.netMarginRate,
    maxCpa: finance.maxCpa,
    breakevenRoas: finance.breakevenRoas,
    status,
    // SPEC 列 18：净利转负（状态已淘汰）时默认不勾选，与手动淘汰行为一致。
    isSelected: status === "已淘汰" ? false : candidate.isSelected,
  };
}

// 候选池纯变换（UI 操作与 Agent 指令共用的单一实现）。
function killInState(state: SelectionScratchpad, candidateId: string): SelectionScratchpad {
  return {
    ...state,
    candidates: state.candidates.map((c) => (c.candidateId === candidateId ? { ...c, status: "已淘汰", isSelected: false } : c)),
    updatedAt: new Date().toISOString(),
  };
}

function restoreInState(state: SelectionScratchpad, candidateId: string): SelectionScratchpad {
  return {
    ...state,
    candidates: state.candidates.map((c) => (c.candidateId === candidateId ? { ...c, status: refineStatusOf({ netProfit: c.netProfit, netMarginRate: c.netMarginRate, weeklyGrowth: c.weeklyGrowth }) } : c)),
    updatedAt: new Date().toISOString(),
  };
}

interface SelectionContextValue {
  shopId: string | null;
  scratchpad: SelectionScratchpad | null;
  running: boolean;
  runError: string;
  highlightThreshold: number | null;
  runPipeline: (filters: SelectionFilterParams) => Promise<void>;
  updateCandidateCost: (candidateId: string, costRmb: number) => boolean;
  simulateCommission: (rate: number) => void;
  toggleCandidate: (candidateId: string) => void;
  toggleAll: (selected: boolean) => void;
  killCandidate: (candidateId: string) => void;
  restoreCandidate: (candidateId: string) => void;
  addManualCandidate: (input: { name: string; category: string; sellingPrice: number; costRmb: number; weightGrams: number }) => void;
  applyCustomScript: (candidateId: string, script: SelectionDraftScript) => void;
  promoteCandidates: (candidateIds: string[]) => Promise<{ promoted: PromoteSelectionResult[]; failed: string[] }>;
  executeUiAction: (action: SelectionUiAction) => string;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { currentShopId } = useShops();
  const [scratchpad, setScratchpad] = useState<SelectionScratchpad | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [highlightThreshold, setHighlightThreshold] = useState<number | null>(null);
  // 进行中流水线请求：店铺切换立即中止（结果绝不落到新店铺）。
  const runControllerRef = useRef<AbortController | null>(null);
  // 进行中推进请求按候选表计数（切换店铺后不再往新店铺拼结果）。
  const promoteShopRef = useRef<string | null>(null);

  // 切换店铺：中止旧店进行中请求，加载该店铺本地沙盒（无则空池）。
  useEffect(() => {
    if (currentShopId === null) return;
    runControllerRef.current?.abort();
    promoteShopRef.current = currentShopId;
    setScratchpad(loadScratchpad(currentShopId));
    setHighlightThreshold(null);
    setRunError("");
  }, [currentShopId]);

  // 每次变更持久化（零污染原则：只写 localStorage，不触数据库；写入失败仅告警）。
  useEffect(() => {
    if (currentShopId === null || scratchpad === null || scratchpad.shopId !== currentShopId) return;
    const fresh = loadScratchpad(currentShopId);
    if (fresh === null || fresh.updatedAt !== scratchpad.updatedAt) {
      safeSetRaw(storageKey(currentShopId), JSON.stringify(scratchpad));
      writeSelectionSummary(currentShopId, scratchpad.candidates);
    }
  }, [scratchpad, currentShopId]);

  const executeUiAction = useCallback((action: SelectionUiAction): string => {
    switch (action.type) {
      case "KILL_CANDIDATE": {
        let found = false;
        setScratchpad((state) => {
          if (!state) return state;
          found = state.candidates.some((c) => c.candidateId === action.candidateId);
          return found ? killInState(state, action.candidateId) : state;
        });
        if (!found) return `未找到编号为 ${action.candidateId} 的候选品，无法淘汰。`;
        return `已淘汰候选品 ${action.candidateId}（${action.reason ? `原因：${action.reason}` : "无备注"}）。`;
      }
      case "RESTORE_CANDIDATE": {
        let found = false;
        setScratchpad((state) => {
          if (!state) return state;
          found = state.candidates.some((c) => c.candidateId === action.candidateId);
          return found ? restoreInState(state, action.candidateId) : state;
        });
        if (!found) return `未找到编号为 ${action.candidateId} 的候选品，无法恢复。`;
        return `已撤销淘汰候选品 ${action.candidateId}，恢复原状态。`;
      }
      case "HIGHLIGHT_LOW_MARGIN": {
        setHighlightThreshold(action.threshold);
        return `已标红毛利率低于 ${(action.threshold * 100).toFixed(0)}% 的候选品。`;
      }
      case "UPDATE_CANDIDATE_COST": {
        if (!Number.isFinite(action.costRmb) || action.costRmb < 0 || action.costRmb > 100000) {
          return "成本数值不合法（需为非负数字），已保持原值。";
        }
        let found = false;
        setScratchpad((state) => {
          if (!state) return state;
          found = state.candidates.some((c) => c.candidateId === action.candidateId);
          if (!found) return state;
          return {
            ...state,
            candidates: state.candidates.map((c) =>
              c.candidateId === action.candidateId ? recalcCandidate({ ...c, costRmb: Number(action.costRmb.toFixed(2)), costEdited: true }) : c,
            ),
            updatedAt: new Date().toISOString(),
          };
        });
        if (!found) return `未找到编号为 ${action.candidateId} 的候选品，无法修改成本。`;
        return `已将候选品 ${action.candidateId} 采购成本更新为 ¥${action.costRmb.toFixed(2)}，整行已重算。`;
      }
      case "SIMULATE_COMMISSION": {
        setScratchpad((state) =>
          state
            ? { ...state, candidates: state.candidates.map((c) => recalcCandidate({ ...c, commissionRate: action.commissionRate })), updatedAt: new Date().toISOString() }
            : state,
        );
        return `已将佣金率模拟为 ${(action.commissionRate * 100).toFixed(0)}% 并重算全部候选品。`;
      }
    }
  }, []);

  // 队列消费：执行属于当前店铺的待办指令，执行结果广播到选品页（页面未打开时队列保留）。
  const drainQueue = useCallback(() => {
    const queue = readQueue();
    const mine = queue.filter((item) => item.shopId === currentShopId);
    if (mine.length === 0) return;
    writeQueue(queue.filter((item) => item.shopId !== currentShopId));
    for (const item of mine) {
      const feedback = executeUiAction(item.action);
      window.dispatchEvent(new CustomEvent(SELECTION_UI_FEEDBACK_EVENT, { detail: feedback }));
    }
  }, [currentShopId, executeUiAction]);

  useEffect(() => {
    if (currentShopId === null) return;
    window.addEventListener(SELECTION_UI_QUEUE_EVENT, drainQueue);
    drainQueue();
    return () => window.removeEventListener(SELECTION_UI_QUEUE_EVENT, drainQueue);
  }, [currentShopId, drainQueue]);

  const runPipeline = useCallback(async (filters: SelectionFilterParams) => {
    if (currentShopId === null) return;
    const shopIdAtStart = currentShopId;
    runControllerRef.current?.abort();
    const controller = new AbortController();
    runControllerRef.current = controller;
    setRunning(true);
    setRunError("");
    try {
      const result = await apiRequest<RunSelectionResult>("POST", "/api/selection/runs", { shopId: shopIdAtStart, filters }, controller.signal);
      if (currentShopId !== shopIdAtStart) return; // 店铺已切换：旧结果丢弃，防止 A 店数据落到 B 店。
      const next: SelectionScratchpad = {
        version: 1,
        shopId: shopIdAtStart,
        filters,
        candidates: result.candidates,
        generatedAt: result.generatedAt,
        updatedAt: new Date().toISOString(),
      };
      setScratchpad(next);
      writeSelectionSummary(shopIdAtStart, result.candidates);
      if (typeof result.note === "string") {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent(SELECTION_UI_FEEDBACK_EVENT, { detail: result.note })), 0);
      }
    } catch (error) {
      if (currentShopId !== shopIdAtStart) return;
      const message = error instanceof Error && error.name === "AbortError" ? "" : error instanceof Error ? error.message : "选品流水线运行失败，请重试";
      setRunError(message);
      throw error;
    } finally {
      if (runControllerRef.current === controller) runControllerRef.current = null;
      if (currentShopId === shopIdAtStart) setRunning(false);
    }
  }, [currentShopId]);

  const updateCandidateCost = useCallback((candidateId: string, costRmb: number): boolean => {
    if (!Number.isFinite(costRmb) || costRmb < 0 || costRmb > 100000) return false;
    setScratchpad((state) =>
      state
        ? { ...state, candidates: state.candidates.map((c) => (c.candidateId === candidateId ? recalcCandidate({ ...c, costRmb: Number(costRmb.toFixed(2)), costEdited: true }) : c)), updatedAt: new Date().toISOString() }
        : state,
    );
    return true;
  }, []);

  const simulateCommission = useCallback((rate: number) => {
    setScratchpad((state) =>
      state
        ? { ...state, candidates: state.candidates.map((c) => recalcCandidate({ ...c, commissionRate: rate })), updatedAt: new Date().toISOString() }
        : state,
    );
  }, []);

  const killCandidate = useCallback((candidateId: string) => {
    setScratchpad((state) => (state ? killInState(state, candidateId) : state));
  }, []);

  const restoreCandidate = useCallback((candidateId: string) => {
    setScratchpad((state) => (state ? restoreInState(state, candidateId) : state));
  }, []);

  const toggleCandidate = useCallback((candidateId: string) => {
    setScratchpad((state) =>
      state
        ? { ...state, candidates: state.candidates.map((c) => (c.candidateId === candidateId ? { ...c, isSelected: !c.isSelected } : c)), updatedAt: new Date().toISOString() }
        : state,
    );
  }, []);

  const toggleAll = useCallback((selected: boolean) => {
    setScratchpad((state) =>
      state
        ? { ...state, candidates: state.candidates.map((c) => (c.status !== "已淘汰" ? { ...c, isSelected: selected } : c)), updatedAt: new Date().toISOString() }
        : state,
    );
  }, []);

  const addManualCandidate = useCallback(
    (input: { name: string; category: string; sellingPrice: number; costRmb: number; weightGrams: number }) => {
      if (currentShopId === null) return;
      setScratchpad((state) => {
        const baseState: SelectionScratchpad = state ?? {
          version: 1,
          shopId: currentShopId,
          filters: {
            targetRegion: "US",
            targetCategory: input.category || "通用",
            priceRange: { min: Number((input.sellingPrice * 0.5).toFixed(2)), max: Number((input.sellingPrice * 1.5).toFixed(2)) },
            minMarginRate: 0.45,
            maxWeightGrams: 500,
            isProhibitedGoodsExcluded: true,
          },
          candidates: [],
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const candidate = recalcCandidate(buildManualCandidate(input, baseState.filters.targetRegion));
        return { ...baseState, candidates: [...baseState.candidates, candidate], updatedAt: new Date().toISOString() };
      });
    },
    [currentShopId],
  );

  const applyCustomScript = useCallback((candidateId: string, script: SelectionDraftScript) => {
    setScratchpad((state) =>
      state
        ? { ...state, candidates: state.candidates.map((c) => (c.candidateId === candidateId ? { ...c, customScript: script } : c)), updatedAt: new Date().toISOString() }
        : state,
    );
  }, []);

  // 推进测品：店铺锚定 + 逐个调用（服务端去重与事务），成功后从沙盒移除，失败项返回给 UI；切换店铺后结果不再写入新店。
  const promoteCandidates = useCallback(async (candidateIds: string[]) => {
    const results = { promoted: [] as PromoteSelectionResult[], failed: [] as string[] };
    if (!scratchpad || currentShopId === null) return results;
    const shopIdAtStart = currentShopId;
    promoteShopRef.current = shopIdAtStart;
    for (const candidateId of candidateIds) {
      if (promoteShopRef.current !== shopIdAtStart) break; // 店铺已切换：中止剩余推进。
      const candidate = scratchpad.candidates.find((item) => item.candidateId === candidateId);
      if (!candidate) {
        results.failed.push("候选品不存在或已移除");
        continue;
      }
      try {
        const promoted = await apiRequest<PromoteSelectionResult>(
          "POST",
          "/api/selection/promotions",
          {
            shopId: shopIdAtStart,
            candidate,
            customDraftScript: candidate.customScript,
          },
          undefined,
          60000,
        );
        results.promoted.push(promoted);
        if (promoteShopRef.current === shopIdAtStart) {
          setScratchpad((state) =>
            state && state.shopId === shopIdAtStart
              ? { ...state, candidates: state.candidates.filter((item) => item.candidateId !== candidateId), updatedAt: new Date().toISOString() }
              : state,
          );
        }
      } catch (error) {
        results.failed.push(error instanceof Error ? error.message : "推进失败");
      }
    }
    if (promoteShopRef.current === shopIdAtStart) promoteShopRef.current = null;
    if (results.promoted.length > 0 && currentShopId === shopIdAtStart) {
      window.dispatchEvent(new CustomEvent(SELECTION_POOL_CHANGED_EVENT));
    }
    return results;
  }, [scratchpad, currentShopId]);

  const value = useMemo<SelectionContextValue>(() => ({
    shopId: currentShopId,
    scratchpad,
    running,
    runError,
    highlightThreshold,
    runPipeline,
    updateCandidateCost,
    simulateCommission,
    toggleCandidate,
    toggleAll,
    killCandidate,
    restoreCandidate,
    addManualCandidate,
    applyCustomScript,
    promoteCandidates,
    executeUiAction,
  }), [currentShopId, scratchpad, running, runError, highlightThreshold, runPipeline, updateCandidateCost, simulateCommission, toggleCandidate, toggleAll, killCandidate, restoreCandidate, addManualCandidate, applyCustomScript, promoteCandidates, executeUiAction]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection 必须在 SelectionProvider 内使用");
  return context;
}
