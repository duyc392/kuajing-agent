// 用途：模型与 API Key 板块，查看和修改对话、生图、FastMoss 三个 Key 及模型选择（复用引导页的表单组件）。
import AppShell from "@/components/layout/app-shell";
import ApiKeyForm from "@/components/onboarding/api-key-form";

export const metadata = {
  title: "模型与 API Key · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">模型与 API Key</h1>
        <p className="mt-2 text-sm text-gray-500">配置对话、生图、FastMoss 三项服务的密钥与模型。</p>
        <div className="mt-6">
          <ApiKeyForm variant="settings" />
        </div>
      </div>
    </AppShell>
  );
}
