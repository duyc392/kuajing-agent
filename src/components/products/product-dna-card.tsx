// 用途：商品 DNA 卡片：平铺展示六维 DNA；未建立时显示引导；编辑态六个文本域一次保存（覆盖旧内容，无历史版本）。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import WorkspaceIcon from "@/components/shared/workspace-icon";
import type { ProductDnaView } from "@/types";

const DNA_FIELDS = [
  { key: "targetPersona", label: "核心用户画像", enLabel: "Persona", icon: "user", placeholder: "如：18-34 岁女性，通勤与学生党，追求精致但预算有限" },
  { key: "useScenarios", label: "核心使用场景", enLabel: "Scene", icon: "pin", placeholder: "如：通勤补妆、宿舍化妆台、旅行收纳" },
  { key: "coreSellingPoints", label: "核心功能卖点", enLabel: "USP", icon: "star", placeholder: "如：三档补光还原自然色；折叠后仅 1cm 随身携带" },
  { key: "visualHooks", label: "视觉冲击效果", enLabel: "Visual", icon: "eye", placeholder: "如：开灯瞬间脸部亮度对比；粉饼盒大小折叠特写" },
  { key: "recommendedFormats", label: "推荐视频呈现方式", enLabel: "Format", icon: "video", placeholder: "如：对比（开灯前后）、教程（通勤快速妆容）、种草" },
  { key: "competitorDifferences", label: "竞品差异与替代痛点", enLabel: "Difference", icon: "shield", placeholder: "如：同价位多为单档补光，本品三档调光且 USB 充电复用" },
] as const;

type DnaFormValues = Record<(typeof DNA_FIELDS)[number]["key"], string>;

const EMPTY_VALUES: DnaFormValues = {
  targetPersona: "", useScenarios: "", coreSellingPoints: "", visualHooks: "", recommendedFormats: "", competitorDifferences: "",
};

function toValues(dna: ProductDnaView): DnaFormValues {
  return {
    targetPersona: dna.targetPersona,
    useScenarios: dna.useScenarios,
    coreSellingPoints: dna.coreSellingPoints,
    visualHooks: dna.visualHooks,
    recommendedFormats: dna.recommendedFormats,
    competitorDifferences: dna.competitorDifferences,
  };
}

// DNA 数据与操作：加载（过期作废 + 取消信号，失败可整页重试）、编辑态、保存覆盖；保存成功清掉历史错误并回填最新内容。
function useProductDna(productId: string, shopId: string) {
  const [dna, setDna] = useState<ProductDnaView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [values, setValues] = useState<DnaFormValues>(EMPTY_VALUES);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!shopId) return;
    let stale = false;
    const controller = new AbortController();
    setDna(null);
    setLoaded(false);
    setError("");
    apiRequest<{ dna: ProductDnaView | null }>("GET", `/api/products/${productId}/dna?shopId=${shopId}`, undefined, controller.signal)
      .then((row) => {
        if (stale) return;
        setDna(row.dna);
        setValues(row.dna ? toValues(row.dna) : EMPTY_VALUES);
        setLoaded(true);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "商品 DNA 加载失败");
        setLoaded(true);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, shopId, reloadCount]);

  function startEdit() {
    setMessage("");
    setError("");
    setValues(dna ? toValues(dna) : EMPTY_VALUES);
  }

  async function save(): Promise<boolean> {
    const blank = DNA_FIELDS.find((field) => values[field.key].trim() === "");
    if (blank) {
      setError(`「${blank.label}」不能为空`);
      return false;
    }
    try {
      const result = await apiRequest<{ dna: ProductDnaView }>("PUT", `/api/products/${productId}/dna?shopId=${shopId}`, values);
      setDna(result.dna);
      setValues(toValues(result.dna));
      setError("");
      setMessage("已保存");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
      return false;
    }
  }

  return { dna, loaded, error, setError, message, setMessage, values, setValues, startEdit, save, retry: () => setReloadCount((count) => count + 1) };
}

interface DnaCardProps {
  productId: string;
  shopId: string;
  /** 挂进商品档案标签页时为 true：不自带卡片壳，由外层统一提供。 */
  flat?: boolean;
}

function DnaReadView({ dna }: { dna: ProductDnaView }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {DNA_FIELDS.map((field) => (
        <div key={field.key} className="rounded-xl bg-[#f0f4f1] p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <WorkspaceIcon name={field.icon} className="shrink-0 text-[#2e6350]" width="17" height="17" />
            {field.label}
            <span className="text-xs font-normal text-[var(--workspace-muted)]">({field.enLabel})</span>
          </p>
          <p className="mt-1.5 text-sm whitespace-pre-wrap text-[#3b534c]">{dna[field.key]}</p>
        </div>
      ))}
    </div>
  );
}

export default function ProductDnaCard({ productId, shopId, flat }: DnaCardProps) {
  const { dna, loaded, error, setError, message, setMessage, values, setValues, startEdit, save, retry } = useProductDna(productId, shopId);
  const [editing, setEditing] = useState(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timer);
  }, [message, setMessage]);

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (await save()) {
        setEditing(false);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function exitEdit() {
    setEditing(false);
    setError("");
  }

  if (!shopId) return null;
  if (!loaded && !error) return <Loading text="加载商品 DNA…" />;

  // 加载失败先看见错误与重试：此时断言"尚未建立 DNA"是误导，错误态下不渲染空态引导。
  if (error && !editing && !dna) {
    return (
      <div className={flat ? "" : "page-card p-5"}>
        <ErrorMessage message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className={flat ? "" : "page-card p-5"}>
      {error && <ErrorMessage message={error} onRetry={retry} />}
      {message && <p className="mb-3 text-sm text-[#2e6350]">{message}</p>}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          商品 DNA
          <span className="ml-2 text-sm font-normal text-[var(--workspace-muted)]">{dna ? `（已提取 6 维度 · 支持随时微调）` : "（未建立）"}</span>
        </h2>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? "保存中…" : dna ? "保存覆盖" : "建立 DNA"}
            </button>
            <button onClick={exitEdit} className="btn btn-outline btn-sm">
              取消
            </button>
          </div>
        ) : (
          <button onClick={startEdit} className="btn btn-outline btn-sm">
            {dna ? "修改 DNA" : "＋ 建立 DNA"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-4 grid gap-3">
          {DNA_FIELDS.map((field) => (
            <label key={field.key} className="grid gap-1 text-xs text-[var(--workspace-muted)]">
              {field.label}
              <textarea
                className="field-input !py-2"
                rows={3}
                value={values[field.key]}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                placeholder={field.placeholder}
                maxLength={1000}
              />
            </label>
          ))}
          <p className="text-xs text-[var(--workspace-muted)]">保存会覆盖当前 DNA，不会保留历史版本。</p>
        </div>
      ) : dna ? (
        <DnaReadView dna={dna} />
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--workspace-border)] p-6 text-center text-sm text-[var(--workspace-muted)]">
          该商品尚未建立 DNA —— 填写六维画像后，生成文案与脚本时才能围绕同一套卖点与场景。
        </p>
      )}
      {dna && !editing && <p className="mt-3 text-xs text-[var(--workspace-muted)]">上次更新：{dna.updatedAt.slice(0, 10)}</p>}
    </div>
  );
}
