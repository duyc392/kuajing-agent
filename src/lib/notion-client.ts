// 用途：Notion 客户端：在指定 database 下创建一条页面（记录）。只做协议对接，属性映射由服务层决定。
import { AppError } from "@/lib/errors";

export interface NotionSettingsInput {
  apiKey: string;
  databaseId: string;
  baseUrl: string;
  version: string;
}

export interface NotionPageResult {
  pageId: string;
  url: string;
}

export async function createNotionPage(params: {
  settings: NotionSettingsInput;
  title: string;
  /** 其余字段：纯文本属性，值会按 Notion rich_text 结构包装 */
  fields: Record<string, string>;
  timeoutMs: number;
}): Promise<NotionPageResult> {
  const { settings } = params;
  if (!settings.apiKey || !settings.databaseId) {
    throw new AppError("尚未配置 Notion 归档：请设置 NOTION_API_KEY 与 NOTION_DATABASE_ID", "NOTION_NOT_CONFIGURED", 501);
  }
  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: params.title.slice(0, 2000) } }] },
  };
  for (const [key, value] of Object.entries(params.fields)) {
    properties[key] = { rich_text: [{ text: { content: String(value).slice(0, 2000) } }] };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/v1/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
        "Notion-Version": settings.version,
      },
      body: JSON.stringify({ parent: { database_id: settings.databaseId }, properties }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      console.error("[notion] 请求失败:", response.status, text.slice(0, 500));
      throw new AppError(`Notion 返回错误（HTTP ${response.status}），请检查集成权限与数据库字段`, "NOTION_ERROR", 502);
    }
    const body = JSON.parse(text) as { id?: unknown; url?: unknown };
    if (typeof body.id !== "string") throw new AppError("Notion 未返回页面 ID，归档可能失败", "NOTION_ERROR", 502);
    return { pageId: body.id, url: typeof body.url === "string" ? body.url : "" };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("无法连接 Notion，请检查网络后重试", "NOTION_NETWORK", 502);
  } finally {
    clearTimeout(timer);
  }
}
