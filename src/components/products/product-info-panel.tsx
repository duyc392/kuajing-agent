// 用途：商品基础信息面板（tab 内容）：展示态只读字段，编辑态复用创建表单同构的表单结构（名称/类目/价格/描述/SKU 规则）；
// 保存与删除由工作区统一管理，本组件只维护切换到编辑态的本地状态。
"use client";

import { useState } from "react";
import type { ProductDetailView } from "@/types";

export interface ProductInfoValues {
  name: string;
  category: string;
  price: string;
  description: string;
  skuRule: string;
}

interface ProductInfoPanelProps {
  product: ProductDetailView;
  saving: boolean;
  editing: boolean;
  onSave: (values: ProductInfoValues) => void;
  onCancelEdit: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm whitespace-pre-wrap text-gray-900">{value}</p>
    </div>
  );
}

function EditForm({ product, submitting, onSubmit, onCancel }: { product: ProductDetailView; submitting: boolean; onSubmit: (values: ProductInfoValues) => void; onCancel: () => void }) {
  const [values, setValues] = useState<ProductInfoValues>({
    name: product.name,
    category: product.category ?? "",
    price: product.price !== null ? product.price.toFixed(2) : "",
    description: product.description ?? "",
    skuRule: product.skuRule ?? "",
  });
  const set = (key: keyof ProductInfoValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
        名称（必填）
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.name} onChange={set("name")} maxLength={200} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        类目
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.category} onChange={set("category")} maxLength={100} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        基础价格
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.price} onChange={set("price")} placeholder="数字，可留空" />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        商品描述
        <textarea className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" rows={4} value={values.description} onChange={set("description")} maxLength={5000} />
      </label>
      <label className="grid gap-1 text-xs text-gray-600">
        SKU 编码规则（Agent 建议）
        <input className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={values.skuRule} onChange={set("skuRule")} maxLength={500} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting || values.name.trim() === ""} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "保存中…" : "保存修改"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
          取消
        </button>
      </div>
    </form>
  );
}

export default function ProductInfoPanel({ product, saving, editing, onSave, onCancelEdit }: ProductInfoPanelProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {editing ? (
        <EditForm product={product} submitting={saving} onSubmit={onSave} onCancel={onCancelEdit} />
      ) : (
        <div className="grid gap-4">
          <Field label="商品描述" value={product.description ?? "（未填写）"} />
          <Field label="SKU 编码规则（Agent 建议）" value={product.skuRule ?? "（未设置）"} />
        </div>
      )}
    </div>
  );
}
