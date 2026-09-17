// 用途：新建商品表单：名称（必填）、类目、基础价格、描述、SKU 编码规则；提交后刷新列表并收起表单。
"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

interface CreateFormProps {
  submitting: boolean;
  onSubmit: (values: { name: string; category: string; price: string; description: string; skuRule: string }) => void;
  onCancel: () => void;
}

function field(label: string, key: string, values: Record<string, string>, setValues: (next: Record<string, string>) => void, maxLength: number) {
  return (
    <label className="grid gap-1 text-xs text-gray-600">
      {label}
      <input
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        value={values[key] ?? ""}
        maxLength={maxLength}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      />
    </label>
  );
}

export default function CreateProductForm({ submitting, onSubmit, onCancel }: CreateFormProps) {
  const [values, setValues] = useState<Record<string, string>>({ name: "", category: "", price: "", description: "", skuRule: "" });

  return (
    <form
      className="grid gap-3 rounded-xl border border-[var(--workspace-border)] bg-[#f6f9f6] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values as { name: string; category: string; price: string; description: string; skuRule: string });
      }}
    >
      {field("名称（必填）", "name", values, setValues, 200)}
      {field("类目", "category", values, setValues, 100)}
      {field("基础价格（数字，可留空）", "price", values, setValues, 20)}
      {field("SKU 编码规则（Agent 建议）", "skuRule", values, setValues, 500)}
      <label className="grid gap-1 text-xs text-[var(--workspace-muted)]">
        商品描述
        <textarea
          className="field-input"
          rows={3}
          value={values.description ?? ""}
          maxLength={5000}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || (values.name ?? "").trim() === ""}
          className="btn btn-primary btn-sm"
        >
          {submitting ? "创建中…" : "创建商品"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
          取消
        </button>
      </div>
    </form>
  );
}
