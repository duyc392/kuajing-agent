// 用途：首次使用引导第 1 步页面：配置三个服务的 API Key（保存到本机后进入创建店铺）。
import ApiKeyForm from "@/components/onboarding/api-key-form";

export const metadata = {
  title: "配置 API Key · TikTok 跨境电商工作台",
};

const STEPS = [
  { label: "配置密钥", active: true },
  { label: "创建店铺", active: false },
  { label: "开始使用", active: false },
];

function StepIndicator() {
  return (
    <ol className="mb-8 flex items-center justify-center gap-2 text-xs">
      {STEPS.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
              step.active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            {index + 1}
          </span>
          <span className={step.active ? "font-medium text-gray-900" : "text-gray-400"}>{step.label}</span>
          {index < STEPS.length - 1 && <span className="text-gray-300">—</span>}
        </li>
      ))}
    </ol>
  );
}

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">欢迎使用 TikTok 跨境电商工作台</h1>
          <p className="mt-2 text-sm text-gray-500">开始之前，先配置三项服务的访问密钥（约 2 分钟）。</p>
        </header>
        <StepIndicator />
        <ApiKeyForm />
      </div>
    </main>
  );
}
