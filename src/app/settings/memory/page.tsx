// 用途：Agent 记忆板块（PRD 故事 43），分类查看、编辑、删除记忆条目。
import SettingsShell from "@/components/settings/settings-shell";
import MemoryManager from "@/components/settings/memory-manager";

export const metadata = {
  title: "Agent 记忆 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <SettingsShell title="Agent 记忆" subtitle="分类查看、编辑、删除店铺画像与偏好记忆。">
      <MemoryManager />
    </SettingsShell>
  );
}
