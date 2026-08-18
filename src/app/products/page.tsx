// 用途：商品列表页，展示当前店铺全部商品（空状态有引导提示）。
import AppShell from "@/components/layout/app-shell";
import ProductList from "@/components/products/product-list";

export const metadata = {
  title: "商品 · TikTok 跨境电商工作台",
};

export default function ProductsPage() {
  return (
    <AppShell>
      <ProductList />
    </AppShell>
  );
}
