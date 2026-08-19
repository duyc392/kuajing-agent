// 用途：商品详情页，含"详情 / 变体 / 文案历史"标签页与编辑、删除操作。
import AppShell from "@/components/layout/app-shell";
import ProductDetail from "@/components/products/product-detail";

export const metadata = {
  title: "商品详情 · TikTok 跨境电商工作台",
};

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <ProductDetail productId={params.id} />
    </AppShell>
  );
}
