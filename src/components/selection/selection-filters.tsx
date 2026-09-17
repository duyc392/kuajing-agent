// 用途：选品策略配置卡（原型区域 1）：目标市场/类目/售价区间/基础过滤 + 自然语言需求描述 + 右下角启动按钮。
"use client";

import { useState } from "react";
import { SELECTION_CATEGORIES, SELECTION_DEFAULTS } from "@/config/selection";
import type { SelectionFilterParams, SelectionRegion } from "@/types";

const REGIONS: Array<{ value: SelectionRegion; label: string }> = [
  { value: "US", label: "🇺🇸 美国 (TikTok Shop US)" },
  { value: "UK", label: "🇬🇧 英国 (TikTok Shop UK)" },
  { value: "ID", label: "🇮🇩 东南亚·印尼" },
];

const EXAMPLE_PROMPT = "重点找适合女性睡前浴室使用、有极强视觉解压感、近期在TikTok增速快的小工具。";

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (next: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="field-input text-xs">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function PriceRangeField({ min, max, onMin, onMax }: { min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void }) {
  return (
    <div>
      <span className="field-label">售价区间 (USD)</span>
      <div className="flex items-center gap-2">
        <input type="number" value={min} onChange={(event) => onMin(event.target.value)} className="field-input w-full text-center text-xs" placeholder="Min" />
        <span className="text-xs text-[var(--workspace-muted)]">至</span>
        <input type="number" value={max} onChange={(event) => onMax(event.target.value)} className="field-input w-full text-center text-xs" placeholder="Max" />
      </div>
    </div>
  );
}

function BasicFilters({ margin, weight, prohibited, onMargin, onWeight, onProhibited }: { margin: boolean; weight: boolean; prohibited: boolean; onMargin: (v: boolean) => void; onWeight: (v: boolean) => void; onProhibited: (v: boolean) => void }) {
  return (
    <div>
      <span className="field-label">基础过滤</span>
      <div className="flex items-center gap-3 pt-2 text-xs text-[#3b534c]">
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={margin} onChange={(event) => onMargin(event.target.checked)} className="accent-[#2e6350]" /><span>毛利率≥45%</span></label>
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={weight} onChange={(event) => onWeight(event.target.checked)} className="accent-[#2e6350]" /><span>≤500g</span></label>
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={prohibited} onChange={(event) => onProhibited(event.target.checked)} className="accent-[#2e6350]" /><span>禁电禁液</span></label>
      </div>
    </div>
  );
}

interface SelectionFiltersProps {
  disabled: boolean;
  onRun: (filters: SelectionFilterParams) => void;
}

export default function SelectionFilters({ disabled, onRun }: SelectionFiltersProps) {
  const [region, setRegion] = useState<SelectionRegion>("US");
  const [category, setCategory] = useState(SELECTION_CATEGORIES[0].value);
  const [priceMin, setPriceMin] = useState(String(SELECTION_DEFAULTS.priceRange.min));
  const [priceMax, setPriceMax] = useState(String(SELECTION_DEFAULTS.priceRange.max));
  const [requireMargin, setRequireMargin] = useState(true);
  const [requireWeight, setRequireWeight] = useState(true);
  const [requireProhibited, setRequireProhibited] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const min = Number(priceMin);
    const max = Number(priceMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min > max) {
      setError("售价区间无效：需为正数且下限不大于上限");
      return;
    }
    setError("");
    onRun({
      targetRegion: region,
      targetCategory: category,
      priceRange: { min, max },
      // 勾选项生效：关掉毛利率过滤传 0（全部保留），关掉重量过滤传大上限（哨兵值见 config）。
      minMarginRate: requireMargin ? SELECTION_DEFAULTS.minMarginRate : 0,
      maxWeightGrams: requireWeight ? SELECTION_DEFAULTS.maxWeightGrams : SELECTION_DEFAULTS.weightFilterOffGrams,
      isProhibitedGoodsExcluded: requireProhibited,
      naturalLanguagePrompt: prompt.trim() === "" ? undefined : prompt.trim(),
    });
  }

  return (
    <section className="page-card p-5">
      <h2 className="mb-4 flex items-center gap-2 border-b border-[var(--workspace-border)] pb-3 text-sm font-bold">
        选品策略与筛选条件
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <LabeledSelect label="目标国家 / 站点" value={region} onChange={(value) => setRegion(value as SelectionRegion)} options={REGIONS} />
        <LabeledSelect label="目标类目" value={category} onChange={setCategory} options={SELECTION_CATEGORIES} />
        <PriceRangeField min={priceMin} max={priceMax} onMin={setPriceMin} onMax={setPriceMax} />
        <BasicFilters
          margin={requireMargin}
          weight={requireWeight}
          prohibited={requireProhibited}
          onMargin={setRequireMargin}
          onWeight={setRequireWeight}
          onProhibited={setRequireProhibited}
        />
      </div>
      <div className="mt-4">
        <label className="field-label">选品需求描述</label>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            placeholder="输入场景、痛点或视觉特征，如：重点找适合女性睡前浴室使用、有极强视觉解压感、近期在TikTok增速快的小工具。"
            className="field-input p-2.5 text-xs"
          />
          <button type="button" onClick={() => setPrompt(EXAMPLE_PROMPT)} className="absolute right-2.5 bottom-2.5 rounded bg-[var(--workspace-soft)] px-2 py-0.5 text-[11px] font-medium text-[#2e6350] hover:bg-[#dcefe5]">
            填入示例
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--workspace-muted)]">提示：当前版本自然语言仅为留痕记录，暂不参与筛选（确定性规则过滤）。</p>
      </div>
      <div className="mt-4 flex items-center justify-end border-t border-[var(--workspace-border)] pt-3">
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="btn btn-primary"
        >
          启动选品
        </button>
      </div>
    </section>
  );
}
