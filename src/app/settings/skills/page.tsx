// 用途：技能管理板块（PRD 故事 47），查看、启用、禁用、删除 Agent 沉淀的技能。
import SettingsShell from "@/components/settings/settings-shell";
import SkillManager from "@/components/settings/skill-manager";

export const metadata = {
  title: "技能管理 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <SettingsShell title="技能管理" subtitle="查看、启用、禁用、删除 Agent 沉淀的技能。">
      <SkillManager />
    </SettingsShell>
  );
}
