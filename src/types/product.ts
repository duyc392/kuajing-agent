// 用途：商品业务域类型：创建 / 更新商品的输入契约与带店铺隔离的查询参数（id + shopId 收进一个对象，参数不超过 2 个）。
export interface ProductCreateInput {
  name: string;
  category?: string | null;
  price?: number | null;
  description?: string | null;
  skuRule?: string | null;
}

export interface ProductUpdateInput {
  name?: string;
  category?: string | null;
  price?: number | null;
  description?: string | null;
  skuRule?: string | null;
}

export interface ProductQuery {
  id: string;
  shopId: string;
}

// 测品状态联合类型：禁止字符串拼写漂移；null 表示普通在售商品。
export type ProductTestingStatus = "testing" | "scaled" | "killed";

// 用途：商品列表展示项：由接口返回的摘要（长度计数代替完整关系数据），商品列表组件的消费契约。
export interface ProductSummary {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  variantCount: number;
  copyCount: number;
  dnaBuilt: boolean;
  testingStatus: ProductTestingStatus | null;
  createdAt: string;
}

// 用途：变体与详情视图类型：变体的创建 / 更新契约、列表行与商品详情（含变体、文案版本）的展示结构。
export interface VariantCreateInput {
  sku: string;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  stock?: number | null;
}

export interface VariantUpdateInput {
  sku?: string;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  stock?: number | null;
}

export interface VariantQuery {
  productId: string;
  variantId: string;
  shopId: string;
}

export interface VariantView {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  price: number | null;
  stock: number | null;
  createdAt: string;
}

export interface CopyView {
  id: string;
  title: string;
  description: string;
  sellingPoints: string | null;
  language: string;
  version: number;
  source: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface ProductDetailView {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  description: string | null;
  skuRule: string | null;
  createdAt: string;
  updatedAt: string;
  variants: VariantView[];
  copies: CopyView[];
}

// 六维商品 DNA：一个商品只有一份当前 DNA（productId 唯一），PUT 为创建或覆盖，不产生历史版本。
export interface ProductDnaView {
  id: string;
  shopId: string;
  productId: string;
  targetPersona: string;
  useScenarios: string;
  coreSellingPoints: string;
  visualHooks: string;
  recommendedFormats: string;
  competitorDifferences: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDnaInput {
  targetPersona: string;
  useScenarios: string;
  coreSellingPoints: string;
  visualHooks: string;
  recommendedFormats: string;
  competitorDifferences: string;
}
