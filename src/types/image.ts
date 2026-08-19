// 用途：商品图片业务域类型（PRD 故事 22-24 与数据对象 ProductImage）：
// 图片文件本体存 public/generated/，记录只存相对路径、用途、生成提示词、应用状态与显示顺序。
export const IMAGE_TOOL_NAME = "generate_product_image";
export const IMAGE_VARIANT_TOOL_NAME = "generate_image_variant";

// 用途："main"（主图）/ "detail"（详情图）/ "variant"（变体）。
export type ProductImageType = "main" | "detail" | "variant";

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

// 工具结果卡数据：生成的产品名、用途、数量与文件路径（前端缩略图预览）；
// incomplete 为时间预算内未完成的数量（>0 时如实告知，不声称全部完成）。
export interface ImageToolDetails {
  productName: string;
  type: ProductImageType;
  imageCount: number;
  paths: string[];
  incomplete?: number;
}
