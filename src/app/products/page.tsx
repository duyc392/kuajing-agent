// 用途：商品列表页，展示当前店铺全部商品（空状态有引导提示）。
import AppShell from "@/components/layout/app-shell";

export const metadata = {
  title: "商品 · TikTok 跨境电商工作台",
};

export default function Page() {
  return (
    <AppShell>
      <div className="flex h-full items-center justify-center text-sm text-gray-400">商品列表（占位，待开发）</div>
    </AppShell>
  );
}
