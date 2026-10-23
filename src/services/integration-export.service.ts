// 用途：标准化 SOP 归档服务：把已确认的阶段产物写进飞书多维表格或 Notion 数据库，返回外部记录链接。
// 只做字段映射与写入，不生成内容；payload 必须是合法 JSON，字段按顶层键展开为纯文本。
import { ValidationError } from "@/lib/errors";
import { readIntegrationsConfig } from "@/lib/integrations-config";
import { createBitableRecord } from "@/lib/feishu-client";
import { createNotionPage } from "@/lib/notion-client";
import { FEISHU_DEFAULTS, NOTION_DEFAULTS } from "@/config/integrations";
import type { ExportProvider, ExportResource, ExportResultDetails } from "@/types";

const FIELD_VALUE_MAX = 2000;
const MAX_FIELDS = 20;

// 外部数据库只能存文本：对象与数组压成 JSON 字符串，超长截断（截断处标注，避免误以为内容完整）。
function toFieldValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > FIELD_VALUE_MAX ? `${text.slice(0, FIELD_VALUE_MAX)}…（已截断）` : text;
}

export function fieldsOf(payload: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new ValidationError("归档内容必须是合法 JSON 文本");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("归档内容必须是 JSON 对象（键值对）");
  }
  const entries = Object.entries(parsed as Record<string, unknown>).slice(0, MAX_FIELDS);
  if (entries.length === 0) throw new ValidationError("归档内容不能为空对象");
  return Object.fromEntries(entries.map(([key, value]) => [key.slice(0, 100), toFieldValue(value)]));
}

export async function exportToIntegration(params: {
  provider: ExportProvider;
  resource: ExportResource;
  title: string;
  payload: string;
}): Promise<ExportResultDetails> {
  const fields = fieldsOf(params.payload);
  const config = await readIntegrationsConfig();
  if (params.provider === "feishu") {
    const result = await createBitableRecord({ settings: config.feishu, fields, timeoutMs: FEISHU_DEFAULTS.timeoutMs });
    return { provider: "feishu", resource: params.resource, externalId: result.recordId, url: result.url, fieldCount: Object.keys(fields).length };
  }
  const result = await createNotionPage({
    settings: { ...config.notion, version: NOTION_DEFAULTS.version },
    title: params.title,
    fields,
    timeoutMs: NOTION_DEFAULTS.timeoutMs,
  });
  return { provider: "notion", resource: params.resource, externalId: result.pageId, url: result.url, fieldCount: Object.keys(fields).length };
}
