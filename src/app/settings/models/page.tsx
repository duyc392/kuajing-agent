// 用途：模型与 API Key 板块，查看和修改对话、生图、FastMoss 三个 Key 及模型选择（复用引导页的表单组件）。
import SettingsShell from "@/components/settings/settings-shell";
import ApiKeyForm from "@/components/onboarding/api-key-form";

export const metadata = {
  title: "模型与 API Key · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <SettingsShell title="模型与 API Key" subtitle="配置对话、生图、FastMoss 三项服务的密钥与模型。">
      <ApiKeyForm variant="settings" />
    </SettingsShell>
  );
}
