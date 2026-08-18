// 用途：店铺业务域类型：创建与更新的输入契约、列表页带商品数的概览结构（API 与 Service 共用，先定义类型再写实现）。
import type { Shop } from "@prisma/client";

export interface ShopCreateInput {
  name: string;
  market: string;
  description?: string | null;
}

export interface ShopUpdateInput {
  name?: string;
  market?: string;
  description?: string | null;
  archived?: boolean;
}

export type ShopOverview = Shop & { productCount: number };

