// 用途：脚本列表页，展示视频脚本与直播脚本（空状态有引导提示）。
import Header from "@/components/layout/header";

export const metadata = {
  title: "脚本 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16 text-center text-sm text-gray-400">脚本列表（占位，待开发）</div>
    </main>
  );
}
