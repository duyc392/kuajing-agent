// 用途：店铺创建页（引导第 2 步）：填写店铺名称 / 市场 / 简述创建店铺，也可从设置进入新增更多店铺。
import Link from "next/link";
import ShopForm from "@/components/shop/shop-form";
import { StepIndicator } from "@/components/shared/step-indicator";

export const metadata = {
  title: "创建店铺 · TikTok 跨境电商工作台",
};

const STEPS = [
  { label: "配置密钥", active: false },
  { label: "创建店铺", active: true },
  { label: "开始使用", active: false },
];

export default function CreateShopPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">创建你的店铺</h1>
          <p className="mt-2 text-sm text-gray-500">
            选品、文案、脚本都会基于这个店铺进行；之后可以随时添加更多店铺并切换。
          </p>
        </header>
        <StepIndicator steps={STEPS} />
        <ShopForm />
        <p className="mt-6 text-center text-xs text-gray-400">
          已有店铺？<Link href="/settings/shops" className="text-blue-600 underline">去店铺管理页</Link> 切换或新增。
        </p>
      </div>
    </main>
  );
}
