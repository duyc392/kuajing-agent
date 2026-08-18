// 用途：店铺创建页（引导第 2 步）：填写店铺名称 / 市场 / 简述创建店铺，也可从设置进入新增更多店铺。
import CreateShopScreen from "@/components/shop/create-shop-screen";

export const metadata = {
  title: "创建店铺 · TikTok 跨境电商工作台",
};

export default function CreateShopPage() {
  return <CreateShopScreen />;
}
