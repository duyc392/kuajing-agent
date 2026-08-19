// 用途：直播脚本详情页，查看和修改直播流程脚本。
import AppShell from "@/components/layout/app-shell";
import LiveScriptDetail from "@/components/scripts/live-script-detail";

export const metadata = {
  title: "直播脚本详情 · TikTok 跨境电商工作台",
};

export default function LiveScriptDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <LiveScriptDetail scriptId={params.id} />
    </AppShell>
  );
}
