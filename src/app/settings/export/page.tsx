// 用途：数据导出板块（PRD 故事 38）：一键导出 Excel 备份文件，并提示 SQLite 文件本身也可作为备份。
import Link from "next/link";
import AppShell from "@/components/layout/app-shell";
import ExportPanel from "@/components/settings/export-panel";

export const metadata = {
  title: "数据导出 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6">
          <Link href="/settings" className="text-xs text-gray-400 hover:text-gray-600">← 返回设置</Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">数据导出</h1>
          <p className="mt-2 text-sm text-gray-500">
            把当前店铺的数据库记录导出为 Excel 文件，用于备份。
          </p>
        </header>
        <ExportPanel />
      </div>
    </AppShell>
  );
}
