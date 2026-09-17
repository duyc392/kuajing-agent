// 用途：变体表单：新建 / 编辑共用（编辑时预填原值），提交 SKU、颜色、尺寸、价格、库存。
"use client";

import { useEffect, useState } from "react";
import type { VariantView } from "@/types";

export interface VariantFormValues {
  sku: string;
  color: string;
  size: string;
  price: string;
  stock: string;
}

interface FormFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function FormField({ label, placeholder, value, onChange }: FormFieldProps) {
  return (
    <label className="grid gap-1 text-xs text-gray-600">
      {label}
      <input
        className="field-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

interface VariantFormProps {
  initial?: VariantView | null;
  submitting: boolean;
  onSubmit: (values: VariantFormValues) => void;
  onCancel?: () => void;
  submitLabel: string;
}

// 编辑对象 → 表单初始值：null 字段转空字符串，价格统一两位小数（防浮点长尾）。
function toFormValues(initial?: VariantView | null): VariantFormValues {
  if (!initial) return { sku: "", color: "", size: "", price: "", stock: "" };
  return {
    sku: initial.sku,
    color: initial.color ?? "",
    size: initial.size ?? "",
    price: initial.price !== null ? initial.price.toFixed(2) : "",
    stock: initial.stock !== null ? String(initial.stock) : "",
  };
}

export default function VariantForm({ initial, submitting, onSubmit, onCancel, submitLabel }: VariantFormProps) {
  // 惰性初始化：切换编辑对象时（配合列表 key 强制重建）首帧即显示正确预填值，消除 useEffect 预填竞态。
  const [values, setValues] = useState<VariantFormValues>(() => toFormValues(initial));

  useEffect(() => {
    if (!initial) return;
    setValues(toFormValues(initial));
  }, [initial]);


  return (
    <form
      className="grid grid-cols-2 gap-3 rounded-xl bg-[#f0f4f1] p-4 sm:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <FormField label="SKU（必填）" placeholder="MZ-RED-M" value={values.sku} onChange={(v) => setValues((prev) => ({ ...prev, sku: v }))} />
      <FormField label="颜色" placeholder="红" value={values.color} onChange={(v) => setValues((prev) => ({ ...prev, color: v }))} />
      <FormField label="尺寸" placeholder="M" value={values.size} onChange={(v) => setValues((prev) => ({ ...prev, size: v }))} />
      <FormField label="价格" placeholder="缺省用商品价" value={values.price} onChange={(v) => setValues((prev) => ({ ...prev, price: v }))} />
      <FormField label="库存" placeholder="数量" value={values.stock} onChange={(v) => setValues((prev) => ({ ...prev, stock: v }))} />
      <div className="col-span-2 flex items-end gap-2 sm:col-span-5">
        <button
          type="submit"
          disabled={submitting || values.sku.trim() === ""}
          className="btn btn-primary btn-sm"
        >
          {submitting ? "保存中…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
            取消
          </button>
        )}
      </div>
    </form>
  );
}
