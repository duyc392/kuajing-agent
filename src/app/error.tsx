// 用途：路由级错误兜底（Next.js 约定）：页面渲染崩溃时显示中文错误与重试按钮，保证不出现白屏或英文报错。
"use client";

import ErrorMessage from "@/components/shared/error-message";

export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <ErrorMessage message={`页面出错了：${error.message || "未知错误"}`} onRetry={reset} />
      </div>
    </div>
  );
}
