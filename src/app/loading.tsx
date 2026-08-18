// 用途：路由级加载兜底（Next.js 约定）：页面切换或服务端渲染期间显示全局加载态，避免白屏。
import Loading from "@/components/shared/loading";

export default function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Loading text="正在进入页面…" />
    </div>
  );
}
