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
