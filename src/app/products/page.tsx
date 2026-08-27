// 用途：商品工作区页面：左侧商品列表 + 右侧全景档案（DNA / 基础信息 / SKU / 图片 / 文案），选中商品写入 ?productId=。
import { Suspense } from "react";
import AppShell from "@/components/layout/app-shell";
import ProductWorkspace from "@/components/products/product-workspace";

export const metadata = {
  title: "商品 · TikTok 跨境电商工作台",
};

export default function ProductsPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ProductWorkspace />
      </Suspense>
    </AppShell>
  );
}
