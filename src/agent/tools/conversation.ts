// 用途：当前对话历史原文的两个原子工具；shopId/conversationId只由服务端绑定。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readConversationMessage, searchConversationHistory } from "@/services/conversation-history.service";
import type { HistoryMessagePage, HistorySearchResult } from "@/types/context";

interface ConversationDeps { shopId: string; conversationId: string; beforeMessageId: string }
const searchSchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 200, description: "要查找的旧要求、脚本措辞或实体关键词" }),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
}, { additionalProperties: false });
const readSchema = Type.Object({
  messageId: Type.String({ description: "搜索返回或摘要引用的原消息id" }),
  offset: Type.Optional(Type.Integer({ minimum: 0, description: "字符起点；nextOffset非空时继续读取" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 16000 })),
  source: Type.Optional(Type.Union([Type.Literal("content"), Type.Literal("toolCalls")], {
    description: "content=消息原文；toolCalls=这条消息的原始工具记录JSON，均分页读取",
  })),
}, { additionalProperties: false });

export function createSearchConversationHistoryTool(deps: ConversationDeps): AgentTool<typeof searchSchema, HistorySearchResult> {
  return { name: "search_conversation_history", label: "搜索对话历史",
    description: "搜索当前对话原文，返回消息id、角色、日期、匹配片段、总数及nextOffset。摘要不是原文，精确引用旧要求或脚本前先搜索再读取。",
    parameters: searchSchema,
    async execute(_id, params: Static<typeof searchSchema>): Promise<AgentToolResult<HistorySearchResult>> {
      const details = await searchConversationHistory({ query: params.query, offset: params.offset, limit: params.limit,
        shopId: deps.shopId, conversationId: deps.conversationId, beforeMessageId: deps.beforeMessageId });
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  };
}

export function createReadConversationMessageTool(deps: ConversationDeps): AgentTool<typeof readSchema, HistoryMessagePage> {
  return { name: "read_conversation_message", label: "读取历史原文",
    description: "按id分页读取当前对话的完整原文或原始工具记录。offset/limit为字符，nextOffset非空表示尚未读完，不能把当前页当完整消息。",
    parameters: readSchema,
    async execute(_id, params: Static<typeof readSchema>): Promise<AgentToolResult<HistoryMessagePage>> {
      const details = await readConversationMessage({ messageId: params.messageId, offset: params.offset, limit: params.limit, source: params.source,
        shopId: deps.shopId, conversationId: deps.conversationId, beforeMessageId: deps.beforeMessageId });
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  };
}
