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
  /** 挂进商品档案标签页时为 true：不自带卡片壳。 */
  flat?: boolean;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--workspace-muted)]">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
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
      <label className="grid gap-1 text-xs text-[var(--workspace-muted)]">
        名称（必填）
        <input className="field-input" value={values.name} onChange={set("name")} maxLength={200} />
      </label>
      <label className="grid gap-1 text-xs text-[var(--workspace-muted)]">
        类目
        <input className="field-input" value={values.category} onChange={set("category")} maxLength={100} />
      </label>
      <label className="grid gap-1 text-xs text-[var(--workspace-muted)]">
        基础价格
        <input className="field-input" value={values.price} onChange={set("price")} placeholder="数字，可留空" />
      </label>
      <label className="grid gap-1 text-xs text-[var(--workspace-muted)]">
        商品描述
        <textarea className="field-input" rows={4} value={values.description} onChange={set("description")} maxLength={5000} />
      </label>
      <label className="grid gap-1 text-xs text-[var(--workspace-muted)]">
        SKU 编码规则（Agent 建议）
        <input className="field-input" value={values.skuRule} onChange={set("skuRule")} maxLength={500} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting || values.name.trim() === ""} className="btn btn-primary btn-sm">
          {submitting ? "保存中…" : "保存修改"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
          取消
        </button>
      </div>
    </form>
  );
}

export default function ProductInfoPanel({ product, saving, editing, onSave, onCancelEdit, flat }: ProductInfoPanelProps) {
  return (
    <div className={flat ? "" : "page-card p-5"}>
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
