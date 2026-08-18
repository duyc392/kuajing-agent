// 用途：数据看板页，展示 GMV、订单量、转化率、流量来源、内容表现等指标。
import AppShell from "@/components/layout/app-shell";

export const metadata = {
  title: "数据看板 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <div className="flex h-full items-center justify-center text-sm text-gray-400">数据看板（占位，数据来自 FastMoss 实时查询）</div>
    </AppShell>
  );
}
