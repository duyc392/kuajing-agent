// 用途：脚本编辑表单（业务域组件）：只允许修改类型/钩子/CTA/风格；总时长由分镜秒数决定、分镜经对话重新生成，不在表单内。
"use client";

import { useState } from "react";

const SCRIPT_TYPES = ["开箱", "教程", "种草", "对比"] as const;

export interface ScriptEditValues {
  type: string;
  hook: string;
  cta: string;
  style: string;
}

interface ScriptEditFormProps {
  hook: string;
  cta: string;
  type: string;
  style: string | null;
  submitting: boolean;
  onSubmit: (values: ScriptEditValues) => void;
  onCancel: () => void;
}

export default function ScriptEditForm({ type, hook, cta, style, submitting, onSubmit, onCancel }: ScriptEditFormProps) {
  const [values, setValues] = useState<ScriptEditValues>({
    type,
    hook,
    cta,
    style: style ?? "",
  });
  const set = (key: keyof ScriptEditValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <label className="grid gap-1 text-xs text-gray-600">
        类型
        <select className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.type} onChange={set("type")}>
          {SCRIPT_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        前 3 秒钩子（必填）
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.hook} onChange={set("hook")} maxLength={200} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        结尾行动号召（必填）
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.cta} onChange={set("cta")} maxLength={200} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        模仿风格
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.style} onChange={set("style")} maxLength={200} placeholder="可留空" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "保存中…" : "保存修改"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          取消
        </button>
      </div>
    </form>
  );
}
