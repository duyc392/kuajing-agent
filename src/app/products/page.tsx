// 用途：商品列表页，展示当前店铺全部商品（空状态有引导提示）。
import Header from "@/components/layout/header";

export const metadata = {
  title: "商品 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16 text-center text-sm text-gray-400">商品列表（占位，待开发）</div>
    </main>
  );
}
