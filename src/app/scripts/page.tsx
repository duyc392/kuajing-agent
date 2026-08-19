// 用途：脚本列表页（PRD 页面清单第 5 项），含「视频脚本 / 直播脚本」两个标签页。
import AppShell from "@/components/layout/app-shell";
import ScriptPageTabs from "@/components/scripts/script-page-tabs";

export const metadata = {
  title: "脚本 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <ScriptPageTabs />
    </AppShell>
  );
}
