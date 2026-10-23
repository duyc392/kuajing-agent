// 用途：文案业务域类型：文案保存工具的参数契约与工具结果结构化数据（聊天结果卡片渲染与消息落库共用）。
// 文案由主 Agent 按文案 SOP 写好，save_product_copy 只负责校验并落成一个新版本，不再调用模型。
export const COPY_TOOL_NAME = "save_product_copy";

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
