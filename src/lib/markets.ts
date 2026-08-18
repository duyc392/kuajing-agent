// 用途：目标市场静态配置：店铺创建与编辑时市场下拉的唯一来源（不在组件里硬编码市场列表）。
export interface MarketOption {
  value: string;
  label: string;
}

const MARKETS: MarketOption[] = [
  { value: "美国", label: "美国" },
  { value: "英国", label: "英国" },
  { value: "德国", label: "德国" },
  { value: "法国", label: "法国" },
  { value: "意大利", label: "意大利" },
  { value: "西班牙", label: "西班牙" },
  { value: "东南亚-印尼", label: "东南亚 · 印尼" },
  { value: "东南亚-泰国", label: "东南亚 · 泰国" },
  { value: "东南亚-越南", label: "东南亚 · 越南" },
  { value: "东南亚-马来西亚", label: "东南亚 · 马来西亚" },
  { value: "东南亚-菲律宾", label: "东南亚 · 菲律宾" },
  { value: "东亚-日本", label: "东亚 · 日本" },
  { value: "东亚-韩国", label: "东亚 · 韩国" },
  { value: "中东-沙特", label: "中东 · 沙特" },
  { value: "拉美-巴西", label: "拉美 · 巴西" },
  { value: "拉美-墨西哥", label: "拉美 · 墨西哥" },
];

export function getMarkets(): MarketOption[] {
  return MARKETS;
}

// 用途：服务端市场白名单校验：接口层兜底，拒绝绕过前端下拉提交的任意市场字符串。
export function isKnownMarket(value: string): boolean {
  return MARKETS.some((market) => market.value === value);
}

