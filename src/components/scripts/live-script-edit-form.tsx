// 用途：直播脚本编辑表单：整段流程编辑（阶段名/分钟/目标/话术逐条改、增删阶段），总时长由阶段分钟数自动重算；
// 提交前本地校验完整性与业务结构（与服务端同一规则），把纯数字分钟转成整数传给父组件。
"use client";

import { useState } from "react";
import { liveFlowStructureProblems } from "@/lib/live-flow";
import type { LiveSegment } from "@/types";

interface DraftSegment {
  phase: string;
  minutes: string;
  goal: string;
  script: string;
}

interface LiveScriptEditFormProps {
  segments: LiveSegment[];
  submitting: boolean;
  onSubmit: (segments: LiveSegment[]) => void;
  onCancel: () => void;
}

function toDraft(segments: LiveSegment[]): DraftSegment[] {
  return segments.map((segment) => ({
    phase: segment.phase,
    minutes: String(segment.minutes),
    goal: segment.goal,
    script: segment.script,
  }));
}

// 单个阶段的编辑行：四个字段 + 删除按钮。
function SegmentRow({ draft, index, removable, onChange, onRemove }: {
  draft: DraftSegment;
  index: number;
  removable: boolean;
  onChange: (patch: Partial<DraftSegment>) => void;
  onRemove: () => void;
}) {
  const set = (key: keyof DraftSegment) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ [key]: event.target.value });
  return (
    <div className="grid gap-2 rounded-lg border border-gray-100 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">阶段 {index + 1}</span>
        <input className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="阶段名（如：开场）" value={draft.phase} onChange={set("phase")} maxLength={50} />
        <input className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="分钟" value={draft.minutes} onChange={set("minutes")} inputMode="numeric" />
        {removable && (
          <button type="button" onClick={onRemove} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">删除</button>
        )}
      </div>
      <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="阶段目标（如：欢迎留人并预告福利）" value={draft.goal} onChange={set("goal")} maxLength={200} />
      <textarea className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" rows={2} placeholder="关键话术（目标市场语言）" value={draft.script} onChange={set("script")} maxLength={2000} />
    </div>
  );
}

export default function LiveScriptEditForm({ segments, submitting, onSubmit, onCancel }: LiveScriptEditFormProps) {
  const [draft, setDraft] = useState<DraftSegment[]>(() => toDraft(segments));
  const [clientError, setClientError] = useState("");

  function updateSegment(index: number, patch: Partial<DraftSegment>) {
    setDraft((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addSegment() {
    setDraft((prev) => [...prev, { phase: "", minutes: "5", goal: "", script: "" }]);
  }

  function removeSegment(index: number) {
    setDraft((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const parsedMinutes = draft.map((item) => Number(item.minutes.trim()));
  const totalMinutes = parsedMinutes.reduce((sum, value) => sum + (Number.isInteger(value) && value > 0 ? value : 0), 0);
  const complete = draft.every(
    (item) => item.phase.trim() !== "" && item.goal.trim() !== "" && item.script.trim() !== "" && Number.isInteger(Number(item.minutes.trim())) && Number(item.minutes.trim()) > 0,
  );
  // 与保存到服务端同一套业务结构规则：删掉开场或任一必要环节时立即提示并禁止保存。
  const structureProblems = liveFlowStructureProblems(
    draft.map((item) => ({
      phase: item.phase.trim(),
      minutes: Number(item.minutes.trim()),
      goal: item.goal.trim(),
      script: item.script.trim(),
    })),
  );
  const savable = complete && structureProblems.length === 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!savable) return;
    setClientError("");
    onSubmit(draft.map((item) => ({
      phase: item.phase.trim(),
      minutes: Number(item.minutes.trim()),
      goal: item.goal.trim(),
      script: item.script.trim(),
    })));
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <p className="text-xs text-gray-500">总时长将保存为 {totalMinutes} 分钟（由各阶段分钟数自动求和）</p>
      {clientError !== "" && <p className="text-xs text-red-600">{clientError}</p>}
      {complete && structureProblems.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          流程不符合直播脚本要求：{structureProblems.join("；")}
        </p>
      )}
      {draft.map((item, index) => (
        <SegmentRow
          key={index}
          draft={item}
          index={index}
          removable={draft.length > 1}
          onChange={(patch) => updateSegment(index, patch)}
          onRemove={() => removeSegment(index)}
        />
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={addSegment} className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">＋ 添加阶段</button>
        <button type="submit" disabled={submitting || !savable} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "保存中…" : "保存修改"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
      </div>
    </form>
  );
}
