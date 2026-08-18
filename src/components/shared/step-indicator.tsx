// 用途：引导流程步骤指示器：显示"配置密钥 → 创建店铺 → 开始使用"的当前进度，被引导页与建店页共用。
export interface StepDefinition {
  label: string;
  active: boolean;
}

interface StepIndicatorProps {
  steps: StepDefinition[];
}

export function StepIndicator({ steps }: StepIndicatorProps) {
  return (
    <ol className="mb-8 flex items-center justify-center gap-2 text-xs">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
              step.active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            {index + 1}
          </span>
          <span className={step.active ? "font-medium text-gray-900" : "text-gray-400"}>{step.label}</span>
          {index < steps.length - 1 && <span className="text-gray-300">—</span>}
        </li>
      ))}
    </ol>
  );
}
