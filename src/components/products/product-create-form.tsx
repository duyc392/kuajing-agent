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
      className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values as { name: string; category: string; price: string; description: string; skuRule: string });
      }}
    >
      {field("名称（必填）", "name", values, setValues, 200)}
      {field("类目", "category", values, setValues, 100)}
      {field("基础价格（数字，可留空）", "price", values, setValues, 20)}
      {field("SKU 编码规则（Agent 建议）", "skuRule", values, setValues, 500)}
      <label className="grid gap-1 text-xs text-gray-600">
        商品描述
        <textarea
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
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
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "创建中…" : "创建商品"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          取消
        </button>
      </div>
    </form>
  );
}
