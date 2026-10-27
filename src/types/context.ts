// 用途：跨层对话上下文契约。数据库原文是事实源，摘要只记录已覆盖的稳定消息边界。
export interface MessageCursor {
  id: string;
  createdAt: Date;
}

export interface ContextMessage extends MessageCursor {
  role: "user" | "agent";
  content: string;
  toolCalls?: string | null;
}

export interface PersistedContextSummary {
  body: string;
  through: MessageCursor;
  revision: number;
  version: number;
}

export interface ContextSnapshot {
  messages: ContextMessage[];
  summary: PersistedContextSummary | null;
  revision: number;
}

export interface ContextModelCapacity {
  contextWindow: number;
  maxTokens: number;
}

export interface ContextToolMetadata {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ContextBudget {
  capacity: number;
  outputReserve: number;
  safetyReserve: number;
  toolReserve: number;
  fixedTokens: number;
  historyTokens: number;
  inputLimit: number;
}

export interface ContextHistoryPlan {
  retained: ContextMessage[];
  compact: ContextMessage[];
  estimatedTokens: number;
  fits: boolean;
}

export interface HistorySearchResult {
  items: Array<{ id: string; role: string; createdAt: string; snippet: string; matchOffset: number }>;
  total: number;
  offset: number;
  nextOffset: number | null;
}

export interface HistoryMessagePage {
  id: string;
  role: string;
  createdAt: string;
  content: string;
  offset: number;
  totalLength: number;
  nextOffset: number | null;
}

export interface StructuredConversationSummary {
  goals: string[];
  constraints: string[];
  factsAndIds: string[];
  decisions: string[];
  pending: string[];
  originalReferences: string[];
}
