// 用途：Agent 记忆板块（PRD 故事 43），分类查看、编辑、删除记忆条目。
import AppShell from "@/components/layout/app-shell";
import MemoryManager from "@/components/settings/memory-manager";

export const metadata = {
  title: "Agent 记忆 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <MemoryManager />
    </AppShell>
  );
}
