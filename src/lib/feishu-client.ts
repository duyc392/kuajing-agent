// 用途：飞书多维表格客户端：取 tenant_access_token 后写入一条记录。只做协议对接，字段映射由服务层决定。
import { AppError } from "@/lib/errors";

export interface FeishuSettingsInput {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
  baseUrl: string;
}

function baseOf(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      console.error("[feishu] 请求失败:", response.status, text.slice(0, 500));
      throw new AppError(`飞书接口返回错误（HTTP ${response.status}），请检查应用权限与表格配置`, "FEISHU_ERROR", 502);
    }
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("无法连接飞书开放平台，请检查网络后重试", "FEISHU_NETWORK", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function tenantToken(settings: FeishuSettingsInput, timeoutMs: number): Promise<string> {
  const body = await postJson(`${baseOf(settings.baseUrl)}/open-apis/auth/v3/tenant_access_token/internal`, {
    app_id: settings.appId,
    app_secret: settings.appSecret,
  }, {}, timeoutMs);
  const token = body.tenant_access_token;
  if (typeof token !== "string" || token === "") {
    throw new AppError("飞书应用鉴权失败，请检查 App ID 与 App Secret", "FEISHU_AUTH", 502);
  }
  return token;
}

export interface FeishuRecordResult {
  recordId: string;
  url: string;
}

export async function createBitableRecord(params: {
  settings: FeishuSettingsInput;
  fields: Record<string, unknown>;
  timeoutMs: number;
}): Promise<FeishuRecordResult> {
  const { settings } = params;
  if (!settings.appId || !settings.appSecret || !settings.appToken || !settings.tableId) {
    throw new AppError("尚未配置飞书归档：请设置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BITABLE_APP_TOKEN / FEISHU_BITABLE_TABLE_ID", "FEISHU_NOT_CONFIGURED", 501);
  }
  const token = await tenantToken(settings, params.timeoutMs);
  const url = `${baseOf(settings.baseUrl)}/open-apis/bitable/v1/apps/${encodeURIComponent(settings.appToken)}/tables/${encodeURIComponent(settings.tableId)}/records`;
  const body = await postJson(url, { fields: params.fields }, { Authorization: `Bearer ${token}` }, params.timeoutMs);
  const data = typeof body.data === "object" && body.data !== null ? (body.data as Record<string, unknown>) : {};
  const record = typeof data.record === "object" && data.record !== null ? (data.record as Record<string, unknown>) : {};
  const recordId = typeof record.record_id === "string" ? record.record_id : "";
  if (recordId === "") throw new AppError("飞书未返回记录 ID，归档可能失败", "FEISHU_ERROR", 502);
  return {
    recordId,
    url: `https://feishu.cn/base/${settings.appToken}?table=${settings.tableId}&record=${recordId}`,
  };
}
