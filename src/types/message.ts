// 用途：消息业务域类型：对话消息视图、发送结果与 SSE 流事件契约（接口层与前端流式解析共用；createdAt 经 JSON 序列化后为 ISO 字符串）。
export type MessageRole = "user" | "agent";

// 一次工具调用的记录：历史消息卡片渲染数据；status 为 running 时仅存在于流式过程，落库的只有 done / error。
export interface ToolCallRecord {
  id: string;
  toolName: string;
  label: string;
  args: unknown;
  status: "running" | "done" | "error";
  details?: unknown;
  error?: string;
}

export interface MessageView {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  toolCalls?: ToolCallRecord[];
}

export interface SendMessageResult {
  userMessage: MessageView;
  agentMessage: MessageView;
}

// SSE 流事件：user=用户消息已入库；tool_start/tool_end=工具调用状态卡与结果卡；delta=Agent 回复增量文本；done=Agent 消息已入库（本轮结束）；error=失败（中文提示）。
export type ChatStreamEvent =
  | { type: "user"; message: MessageView }
  | { type: "tool_start"; call: ToolCallRecord }
  | { type: "tool_end"; call: ToolCallRecord }
  | { type: "delta"; text: string }
  | { type: "done"; agentMessage: MessageView }
  | { type: "error"; error: string };

// Agent 历史消息项：服务层查历史与 Agent 执行层的输入共用（services 与 agent 都可 import 类型层）。
export interface HistoryItem {
  role: "user" | "agent";
  content: string;
  createdAt: Date;
}
