// 用途：内容创作页（替代旧脚本页）：左侧创作商品选择 + 右侧 5 个子页（视频运营 / 内容库 / 脚本库 / 素材需求库 / 数据复盘）。
import AppShell from "@/components/layout/app-shell";
import ContentWorkspace from "@/components/content/content-workspace";

export const metadata = {
  title: "内容创作 · TikTok 跨境电商工作台",
};

export default function ContentPage() {
  return (
    <AppShell>
      <ContentWorkspace />
    </AppShell>
  );
}
