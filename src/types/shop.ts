// 用途：店铺业务域类型：创建与更新店铺的输入契约（API 与 Service 共用，先定义类型再写实现）。
export interface ShopCreateInput {
  name: string;
  market: string;
  description?: string | null;
}

export interface ShopUpdateInput {
  name?: string;
  market?: string;
  description?: string | null;
}
