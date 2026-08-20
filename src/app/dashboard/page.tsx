// 用途：数据看板页（PRD 页面清单第 6 项），展示 GMV、订单量、转化率、流量来源、内容表现等指标。
import AppShell from "@/components/layout/app-shell";
import DashboardView from "@/components/dashboard/dashboard-view";

export const metadata = {
  title: "数据看板 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
