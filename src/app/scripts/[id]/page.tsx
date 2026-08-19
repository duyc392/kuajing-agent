// 用途：脚本详情页，查看和修改视频分镜脚本。
import AppShell from "@/components/layout/app-shell";
import ScriptDetail from "@/components/scripts/script-detail";

export const metadata = {
  title: "脚本详情 · TikTok 跨境电商工作台",
};

export default function ScriptDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <ScriptDetail scriptId={params.id} />
    </AppShell>
  );
}
