// 用途：数据导出板块（PRD 故事 38）：一键导出 Excel 备份文件，并提示 SQLite 文件本身也可作为备份。
import SettingsShell from "@/components/settings/settings-shell";
import ExportPanel from "@/components/settings/export-panel";

export const metadata = {
  title: "数据导出 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <SettingsShell title="数据导出" subtitle="把当前店铺的数据库记录导出为 Excel 文件，用于备份。">
      <ExportPanel />
    </SettingsShell>
  );
}
