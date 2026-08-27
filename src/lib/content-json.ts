// 用途：内容运营 JSON 文本字段的统一解析与序列化：SQLite 不支持 Json 类型，数据库一律存 JSON 文本；
// 读取时安全解析，内容缺失或非法时返回空数组，绝不让坏数据把页面或服务打崩。
export function parseNumberArray(raw: string | null | undefined): number[] {
  const parsed = safeParseArray(raw);
  if (!parsed) return [];
  return parsed.every((item) => typeof item === "number" && Number.isFinite(item)) ? (parsed as number[]) : [];
}

export function parseStringArray(raw: string | null | undefined): string[] {
  const parsed = safeParseArray(raw);
  if (!parsed) return [];
  return parsed.every((item) => typeof item === "string") ? (parsed as string[]) : [];
}

export function toJsonText(value: readonly unknown[]): string {
  return JSON.stringify(value);
}

// 解析出数组则返回，否则返回 null（不是数组、元素类型混杂、JSON 非法都算失败）。
function safeParseArray(raw: string | null | undefined): unknown[] | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
