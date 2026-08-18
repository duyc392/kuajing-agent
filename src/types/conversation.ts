// 用途：对话业务域类型：侧边栏列表项摘要与创建输入契约（API 与 Service 共用；updatedAt 经 JSON 序列化后为 ISO 字符串）。
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ConversationCreateInput {
  shopId: string;
  title?: string;
}

// 唯一默认对话标题：新建对话与"首条消息自动命名"的判断共用这一个常量，防止两处字面量漂移。
export const DEFAULT_CONVERSATION_TITLE = "新对话";
