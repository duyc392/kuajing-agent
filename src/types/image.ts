// 用途：商品图片业务域类型（PRD 故事 22-24 与数据对象 ProductImage）：
// 图片文件本体存 public/generated/，记录只存相对路径、用途、生成提示词、应用状态与显示顺序。
export const IMAGE_TOOL_NAME = "render_product_image";
export const IMAGE_RECORD_TOOL_NAME = "save_product_image_record";
export const IMAGE_WORKFLOW_TOOL_NAME = "run_image_workflow";

// 用途："main"（主图）/ "detail"（详情图）/ "variant"（变体）。
export type ProductImageType = "main" | "detail" | "variant";

// 固定出图工作流：与 render_product_image 共用同一个生图模型与接口，区别只是提示词由固定模板拼成，
// 保证同一场景下多张图风格一致；模板里的 {{subject}} / {{scene}} 由主 Agent 用英文填写。
export const IMAGE_WORKFLOWS = ["text-to-image", "background-replace", "model-swap", "storyboard"] as const;
export type ImageWorkflow = (typeof IMAGE_WORKFLOWS)[number];

export interface RenderImageDetails {
  productName: string;
  type: ProductImageType;
  prompt: string;
  imageCount: number;
  paths: string[];
  /** 时间预算内未完成的数量（>0 时如实告知，不声称全部完成） */
  incomplete: number;
}

export interface ImageWorkflowDetails {
  workflow: ImageWorkflow;
  /** 实际提交给模型的完整英文提示词（模板 + 主体 + 场景），便于追溯与复用 */
  prompt: string;
  imageCount: number;
  paths: string[];
  incomplete: number;
}

export interface ProductImageView {
  id: string;
  productId: string;
  path: string;
  type: ProductImageType;
  prompt: string | null;
  applied: boolean;
  sortOrder: number;
  createdAt: string;
}

// 创建契约：文件已写入磁盘，这里只落档案记录。
export interface ProductImageCreateInput {
  path: string;
  type: ProductImageType;
  prompt: string;
  sortOrder: number;
}

// 修改契约：应用状态 / 显示顺序 / 用途可改，其余不可改（未知字段由 API 层严格拒绝）。
export interface ProductImageUpdateInput {
  applied?: boolean;
  sortOrder?: number;
  type?: ProductImageType;
}
