// 用途：选品沙盒操作指令卡（SPEC 7.2）：渲染 Agent 返回的结构化指令，并把指令写入 localStorage 队列
// （按当前对话店铺入队）后广播；选品工作台页面消费队列执行——页面未打开时指令不丢失，打开后自动生效。
"use client";

import { useEffect, useRef } from "react";
import type { SelectionUiAction, ToolCallRecord } from "@/types";
import ToolStatusCard, { cardStyle } from "@/components/chat/tool-status-card";
import { enqueueUiAction } from "@/components/selection/selection-context";
import { CURRENT_SHOP_STORAGE_KEY } from "@/components/shop/shop-context";

function actionText(action: SelectionUiAction): string {
  switch (action.type) {
    case "KILL_CANDIDATE":
      return `淘汰候选品 ${action.candidateId}（${action.reason ?? "无备注"}）`;
    case "RESTORE_CANDIDATE":
      return `撤销淘汰 ${action.candidateId}`;
    case "HIGHLIGHT_LOW_MARGIN":
      return `标红毛利率低于 ${(action.threshold * 100).toFixed(0)}% 的候选品`;
    case "UPDATE_CANDIDATE_COST":
      return `修改候选品 ${action.candidateId} 采购成本为 ¥${action.costRmb.toFixed(2)}`;
    case "SIMULATE_COMMISSION":
      return `模拟 ${(action.commissionRate * 100).toFixed(0)}% 达人佣金并重算`;
  }
}

const EXECUTED_CALLS_KEY = "selection-executed-call-ids";

function isCallExecuted(callId: string): boolean {
  try {
    const raw = window.localStorage.getItem(EXECUTED_CALLS_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.includes(callId);
  } catch {
    return false;
  }
}

function markCallExecuted(callId: string): void {
  try {
    const raw = window.localStorage.getItem(EXECUTED_CALLS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(callId)) {
      ids.push(callId);
      window.localStorage.setItem(EXECUTED_CALLS_KEY, JSON.stringify(ids.slice(-500)));
    }
  } catch {}
}

export default function SelectionWorkbenchCard({ call }: { call: ToolCallRecord }) {
  const details = call.details as { actions?: SelectionUiAction[]; shopId?: string } | undefined;
  const actions = details?.actions;

  // 指令入队（按 call.id 唯一执行一次，防止查看历史消息时二次入队篡改用户修改）。
  useEffect(() => {
    if (call.status !== "done" || actions === undefined || actions.length === 0) return;
    if (isCallExecuted(call.id)) return;
    markCallExecuted(call.id);

    const targetShopId = details?.shopId ?? window.localStorage.getItem(CURRENT_SHOP_STORAGE_KEY);
    if (targetShopId !== null) {
      for (const action of actions) enqueueUiAction(targetShopId, action);
    }
  }, [call.status, call.id, actions, details]);

  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  if (actions === undefined || actions.length === 0) {
    return <ToolStatusCard label={call.label} status="invalid" />;
  }
  return (
    <div className={cardStyle("blue")}>
      <p className="font-medium text-gray-900">⚡ 选品沙盒操作 · {actions.length} 条指令</p>
      <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
        {actions.map((action, index) => <li key={index}>• {actionText(action)}</li>)}
      </ul>
      <p className="mt-1 text-gray-400">
        {window.localStorage.getItem(CURRENT_SHOP_STORAGE_KEY) === null ? "尚未选择店铺，指令暂未入队。" : "指令已入队；选品工作台页面打开后自动执行。"}
      </p>
    </div>
  );
}
