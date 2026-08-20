// 用途：数字与金额工具：表单数字字段解析（空字符串转 null、非法输入抛中文错误，避免 Number("abc")=NaN 被 JSON 静默序列化成 null）与价格显示格式化（统一两位小数，防浮点长尾）。
// 业务数值上限（集中定义，不散落在各处）：
export const MAX_INT32 = 2147483647; // SQLite 经 Prisma Int 为 32 位有符号整数，库存等整数字段上限
export const MAX_PRICE = 10000000; // 商品/变体价格业务上限（1000 万），同时挡住 1e308 一类极端浮点

export function parseNullableNumber(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error(`${label}必须是数字`);
  return parsed;
}

export function parseNullableInt(value: string, label: string): number | null {
  const parsed = parseNullableNumber(value, label);
  if (parsed !== null && !Number.isInteger(parsed)) throw new Error(`${label}必须是整数`);
  return parsed;
}

export function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

// 大额美元金额压缩显示：$1.2K / $3.45M / $1.23B（看板 GMV 等场景）。
export function formatCompactMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// 大额数量压缩显示：1.2万 / 3.45亿（看板销量/播放量等场景）。
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return `${value.toFixed(0)}`;
}

// 百分比显示：保留一位小数；非有限数值给占位符。
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}
