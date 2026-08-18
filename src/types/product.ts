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

// 用途：商品接口返回行的结构子集：列表计数只用到关系字段（variants / copies）的长度，不展示完整关系数据。
export interface ProductListRow {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  variants: { id: string }[];
  copies: { id: string }[];
}

// 用途：商品列表展示项：由接口行折算出的摘要（长度计数代替完整关系数据），商品列表组件的消费契约。
export interface ProductSummary {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  variantCount: number;
  copyCount: number;
}
