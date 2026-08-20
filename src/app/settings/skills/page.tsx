// 用途：技能管理板块（PRD 故事 47），查看、启用、禁用、删除 Agent 沉淀的技能。
import AppShell from "@/components/layout/app-shell";
import SkillManager from "@/components/settings/skill-manager";

export const metadata = {
  title: "技能管理 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <SkillManager />
    </AppShell>
  );
}
