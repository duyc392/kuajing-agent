// 用途：店铺表单字段组：店铺名称（必填）、所属市场（下拉）、店铺简述（选填），创建与编辑共用，避免重复代码。
"use client";

import { getMarkets } from "@/lib/markets";

export interface ShopFieldsValue {
  name: string;
  market: string;
  description: string;
}

interface ShopFieldsProps {
  value: ShopFieldsValue;
  onChange: (next: ShopFieldsValue) => void;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ShopFields({ value, onChange }: ShopFieldsProps) {
  const markets = getMarkets();
  const known = value.market === "" || markets.some((m) => m.value === value.market);
  const options = known ? markets : [{ value: value.market, label: `${value.market}（当前值）` }, ...markets];

  return (
    <div className="grid gap-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">店铺名称 <span className="text-red-500">*</span></span>
        <input
          className={INPUT_CLASS}
          value={value.name}
          maxLength={50}
          placeholder="如：奥兰多美妆小铺"
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">所属市场 <span className="text-red-500">*</span></span>
        <select
          className={INPUT_CLASS}
          value={value.market}
          onChange={(event) => onChange({ ...value, market: event.target.value })}
        >
          {value.market === "" && <option value="">请选择市场</option>}
          {options.map((market) => (
            <option key={market.value} value={market.value}>{market.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">店铺简述（选填）</span>
        <textarea
          className={INPUT_CLASS}
          rows={3}
          maxLength={200}
          value={value.description}
          placeholder="主营品类、目标人群等，Agent 对话时会参考这段描述"
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>
    </div>
  );
}
