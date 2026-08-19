// 用途：文案业务域类型：文案生成工具的参数契约与工具结果结构化数据（聊天结果卡片渲染与消息落库共用）。
export const COPY_TOOL_NAME = "generate_product_copy";

export interface CopyToolArgs {
  productName: string;
  language: string;
  feedback?: string;
}

export interface CopyToolDetails {
  copyId: string;
  productId: string;
  title: string;
  description: string;
  sellingPoints: string;
  language: string;
  version: number;
  isCurrent: boolean;
}
