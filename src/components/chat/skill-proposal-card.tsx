// 用途：技能沉淀确认卡片（PRD 故事 46）：渲染 propose_skill 工具调用，展示拟创建的技能内容；
// 卖家「确认创建」经 /api/skills 创建技能（同名同内容幂等）并把卡片状态持久化，「忽略」仅持久化状态不创建；
// 确认/忽略结果写入消息 toolCalls JSON（经 PATCH /api/messages/[id]），刷新后卡片按服务端状态渲染，不再只依赖内存。
"use client";

import { useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import type { SkillProposalDetails, SkillView, ToolCallRecord } from "@/types";
import ToolStatusCard from "@/components/chat/tool-status-card";

export default function SkillProposalCard({ call, messageId }: { call: ToolCallRecord; messageId?: string }) {
  const { currentShopId } = useShops();
  const [localPhase, setLocalPhase] = useState<"confirmed" | "ignored" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const phase = localPhase ?? call.proposalState ?? "pending";

  if (call.status === "running") return <ToolStatusCard label={call.label} status="running" />;
  if (call.status === "error") return <ToolStatusCard label={call.label} status="error" error={call.error} />;
  const details = call.details as SkillProposalDetails | undefined;
  if (!details || typeof details.name !== "string" || typeof details.prompt !== "string") {
    return <ToolStatusCard label={call.label} status="invalid" />;
  }
  const proposal: SkillProposalDetails = details;

  async function persist(state: "confirmed" | "ignored", skillId?: string) {
    if (!messageId || !currentShopId) return;
    await apiRequest<unknown>("PATCH", `/api/messages/${messageId}`, {
      shopId: currentShopId,
      toolCallId: call.id,
      proposalState: state,
      ...(skillId ? { skillId } : {}),
    });
  }

  async function confirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const skill = await apiRequest<SkillView>("POST", "/api/skills", {
        name: proposal.name,
        description: proposal.description,
        prompt: proposal.prompt,
      });
      await persist("confirmed", skill.id);
      setLocalPhase("confirmed");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "创建失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function ignore() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      await persist("ignored");
      setLocalPhase("ignored");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (phase === "confirmed") {
    return <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">✓ 已创建技能「{proposal.name}」，可在「设置 → 技能管理」查看、启用或删除。</div>;
  }
  if (phase === "ignored") {
    return <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">已忽略，未创建技能。</div>;
  }

  const canAct = Boolean(messageId && currentShopId);
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-medium text-gray-900">💡 建议沉淀为技能：{proposal.name}</p>
      {proposal.description !== "" && <p className="mt-1 text-xs text-gray-600">{proposal.description}</p>}
      <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{proposal.prompt}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => void confirm()}
          disabled={busy || !canAct}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "处理中…" : "确认创建"}
        </button>
        <button
          onClick={() => void ignore()}
          disabled={busy || !canAct}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          忽略
        </button>
      </div>
      {!canAct && <p className="mt-1 text-xs text-gray-400">回复完成后可确认。</p>}
      {message !== "" && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </div>
  );
}
