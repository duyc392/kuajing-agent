// 用途：旧商品详情路由：不再维护第二套详情 UI，统一跳转到工作区并选中该商品（/products?productId=[id]）。
import { redirect } from "next/navigation";

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  redirect(`/products?productId=${params.id}`);
}
