// 用途：数据导出板块，一键导出 Excel 备份文件（并提示 SQLite 文件本身即备份）。
import Header from "@/components/layout/header";

export const metadata = {
  title: "数据导出 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16 text-center text-sm text-gray-400">数据导出（占位，待开发）</div>
    </main>
  );
}
