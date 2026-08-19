// 用途：FastMoss MCP 客户端（PRD 故事 13-15 数据源；PRD 边界：外部数据经 MCP 协议接入，不改 Agent 核心）：
// 实现 MCP Streamable HTTP 的最小客户端——初始化会话、调用工具、把底层错误翻译成中文业务错误。
// 每次调用 30 秒超时，会话失效自动重建一次；额度不足（402）给卖家可执行的充值指引；原始错误只进服务端日志。
import { AppError } from "@/lib/errors";

export interface FastmossSettings {
  apiKey: string;
  baseUrl: string;
}

export interface FastmossMCPClient {
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}

const CALL_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 10_000;

interface McpSessionState {
  sessionId: string | null;
  nextId: number;
}

function timeoutError(): AppError {
  return new AppError("FastMoss 数据服务响应超时，请稍后重试", "FASTMOSS_TIMEOUT", 502);
}

function statusError(status: number): AppError {
  if (status === 402) {
    return new AppError("FastMoss 数据额度不足，请到 FastMoss 开放平台充值后重试", "FASTMOSS_QUOTA", 402);
  }
  return new AppError(`FastMoss 数据服务返回错误（HTTP ${status}）`, "FASTMOSS_ERROR", 502);
}

// 响应正文解析：JSON 响应直接解析；SSE 响应逐帧提取 data: 行后解析（客户端声明接受两种格式，须都支持）。
function parseResponseText(raw: string, contentType: string | null): unknown {
  if (contentType?.includes("text/event-stream")) {
    const lines = raw.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    if (lines.length === 0) return raw;
    const payload = lines.map((line) => line.slice(5).trimStart()).join("\n");
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// 工具结果正文是 JSON 文本；部分工具外层套 { params, result, tool_id }，统一剥出业务数据。
function parseToolResult(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "result" in (parsed as Record<string, unknown>)) {
      return (parsed as { result: unknown }).result;
    }
    return parsed;
  } catch {
    return text;
  }
}

// 单次 HTTP POST：外层 AbortSignal 与 30 秒超时共同中止；返回状态码、解析后的正文与响应头里的会话 ID。
async function mcpPost(endpoint: string, apiKey: string, sessionId: string | null, body: unknown, signal?: AbortSignal): Promise<{ status: number; body: unknown; session: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${apiKey}`,
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted && !signal?.aborted) throw timeoutError();
      throw new AppError("无法连接 FastMoss 数据服务，请检查网络后重试", "FASTMOSS_NETWORK", 502);
    }
    const text = await response.text();
    return {
      status: response.status,
      body: parseResponseText(text, response.headers.get("content-type")),
      session: response.headers.get("mcp-session-id"),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// MCP 握手：initialize → 拿会话 ID → 补发 initialized 通知。
async function initializeMcpSession(state: McpSessionState, endpoint: string, apiKey: string, signal?: AbortSignal): Promise<void> {
  const response = await mcpPost(endpoint, apiKey, null, {
    jsonrpc: "2.0",
    id: state.nextId++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "kuajing-agent", version: "0.1.0" },
    },
  }, signal);
  if (response.status !== 200 || !response.session) {
    throw statusError(response.status);
  }
  state.sessionId = response.session;
  // 通知握手完成（响应可能是空 SSE，忽略结果）。
  await mcpPost(endpoint, apiKey, state.sessionId, { jsonrpc: "2.0", method: "notifications/initialized" }, signal);
}

// 调用工具：会话失效时重建会话重试一次；工具错误原文只进服务端日志，前端统一收中文提示。
async function callMcpTool(state: McpSessionState, endpoint: string, apiKey: string, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!state.sessionId) await initializeMcpSession(state, endpoint, apiKey, signal);
    const response = await mcpPost(endpoint, apiKey, state.sessionId, {
      jsonrpc: "2.0",
      id: state.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    }, signal);
    if (response.status !== 200) {
      const body = response.body as { error?: { message?: string } } | null;
      if (body?.error?.message?.includes("session")) {
        state.sessionId = null;
        continue;
      }
      throw statusError(response.status);
    }
    const rpc = response.body as { result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> } };
    if (!rpc.result) throw new AppError("FastMoss 数据服务响应格式异常", "FASTMOSS_ERROR", 502);
    if (rpc.result.isError) {
      console.error("[fastmoss] 工具调用失败（原始信息不返回前端）:", rpc.result.content?.map((item) => item.text ?? "").join(" "));
      throw new AppError("FastMoss 查询失败，请稍后重试", "FASTMOSS_TOOL_ERROR", 502);
    }
    const text = rpc.result.content?.map((item) => item.text ?? "").join("").trim() ?? "";
    return parseToolResult(text);
  }
  throw new AppError("FastMoss 数据服务会话异常，请重试", "FASTMOSS_ERROR", 502);
}

// 会话清理：尽力而为，失败不影响业务。
async function closeMcpSession(state: McpSessionState, endpoint: string, apiKey: string): Promise<void> {
  if (!state.sessionId) return;
  try {
    await fetch(endpoint, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}`, "Mcp-Session-Id": state.sessionId },
      signal: AbortSignal.timeout(CLOSE_TIMEOUT_MS),
    });
  } catch {
    // 忽略清理失败。
  }
  state.sessionId = null;
}

export async function createFastmossClient(settings: FastmossSettings): Promise<FastmossMCPClient> {
  const endpoint = settings.baseUrl.replace(/\/+$/, "") + "/mcp";
  const state: McpSessionState = { sessionId: null, nextId: 1 };
  return {
    callTool: (name, args, signal) => callMcpTool(state, endpoint, settings.apiKey, name, args, signal),
    close: () => closeMcpSession(state, endpoint, settings.apiKey),
  };
}
