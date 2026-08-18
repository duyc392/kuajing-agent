// 用途：首次使用引导第 1 步页面：配置三个服务的 API Key（保存到本机后进入创建店铺）。
import ApiKeyForm from "@/components/onboarding/api-key-form";
import { StepIndicator } from "@/components/shared/step-indicator";

export const metadata = {
  title: "配置 API Key · TikTok 跨境电商工作台",
};

const STEPS = [
  { label: "配置密钥", active: true },
  { label: "创建店铺", active: false },
  { label: "开始使用", active: false },
];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">欢迎使用 TikTok 跨境电商工作台</h1>
          <p className="mt-2 text-sm text-gray-500">开始之前，先配置三项服务的访问密钥（约 2 分钟）。</p>
        </header>
        <StepIndicator steps={STEPS} />
        <ApiKeyForm />
      </div>
    </main>
  );
}
