// 用途：快捷指令按钮组（PRD 故事 9）：输入框上方提供「生成文案 / 写脚本 / 选品分析 / 数据解读 / 运营建议」。
// 写脚本与数据解读点击直接发送预设指令；生成文案先选商品、选品分析先输入品类关键词，参数齐全后再发送，
// 由 Agent 按系统提示词路由到对应工具，省去每次打字。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import type { ProductSummary } from "@/types";

interface QuickCommandsProps {
  disabled: boolean;
  onSend: (prompt: string) => void;
}

// 无需额外参数的指令：点击直接发送（写脚本补全类型与时长，数据解读按故事 29 走纯对话诊断）。
const IMMEDIATE_COMMANDS = [
  { label: "写脚本", prompt: "帮我写一个 30 秒的种草视频脚本" },
  { label: "数据解读", prompt: "帮我解读店铺数据并给出优化建议" },
  { label: "运营建议", prompt: "请给我一份综合运营建议：综合店铺数据、市场趋势、竞品动态和平台规则，按阶段给出可执行的具体建议" },
] as const;

// 商品选择器：加载当前店铺商品，点击后回调商品名（补全 generate_product_copy 的 productName）。
function ProductPicker({ shopId, disabled, onPick }: { shopId: string; disabled: boolean; onPick: (name: string) => void }) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    apiRequest<ProductSummary[]>("GET", `/api/products?shopId=${shopId}`)
      .then((rows) => {
        if (!stale) setProducts(rows);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "商品加载失败");
      });
    return () => {
      stale = true;
    };
  }, [shopId]);
  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (products.length === 0) return <p className="text-xs text-gray-400">当前店铺还没有商品，请先在「商品」页创建。</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(product.name)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
        >
          {product.name}
        </button>
      ))}
    </div>
  );
}

// 关键词输入器：输入品类关键词后提交（补全 analyze_market 的 keywords）。
function KeywordPicker({ disabled, onPick }: { disabled: boolean; onPick: (keyword: string) => void }) {
  const [keyword, setKeyword] = useState("");
  function submit() {
    const value = keyword.trim();
    if (value === "") return;
    onPick(value);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <input
        value={keyword}
        disabled={disabled}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="输入品类关键词，如：宠物用品"
        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={disabled || keyword.trim() === ""}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        分析
      </button>
    </form>
  );
}

export default function QuickCommands({ disabled, onSend }: QuickCommandsProps) {
  const { currentShopId } = useShops();
  const [param, setParam] = useState<"copy" | "selection" | null>(null);

  function pickProduct(name: string) {
    onSend(`帮我为「${name}」生成上架文案`);
    setParam(null);
  }
  function pickKeyword(keyword: string) {
    onSend(`帮我分析「${keyword}」的选品机会`);
    setParam(null);
  }

  const buttonClass =
    "rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="bg-white px-4 pt-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap gap-2">
          {IMMEDIATE_COMMANDS.map((command) => (
            <button key={command.label} type="button" disabled={disabled} onClick={() => onSend(command.prompt)} className={buttonClass}>
              {command.label}
            </button>
          ))}
          <button type="button" disabled={disabled} onClick={() => setParam(param === "copy" ? null : "copy")} className={buttonClass}>
            生成文案
          </button>
          <button type="button" disabled={disabled} onClick={() => setParam(param === "selection" ? null : "selection")} className={buttonClass}>
            选品分析
          </button>
        </div>
        {param === "copy" && currentShopId && (
          <div className="mt-2">
            <ProductPicker shopId={currentShopId} disabled={disabled} onPick={pickProduct} />
          </div>
        )}
        {param === "selection" && (
          <div className="mt-2">
            <KeywordPicker disabled={disabled} onPick={pickKeyword} />
          </div>
        )}
      </div>
    </div>
  );
}
