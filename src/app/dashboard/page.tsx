// 用途：数据看板页，展示 GMV、订单量、转化率、流量来源、内容表现等指标。
import Header from "@/components/layout/header";

export const metadata = {
  title: "数据看板 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16 text-center text-sm text-gray-400">数据看板（占位，数据来自 FastMoss 实时查询）</div>
    </main>
  );
}
