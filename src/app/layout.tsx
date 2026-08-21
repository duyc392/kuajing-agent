// 用途：根布局，定义全局 HTML 结构、引入全局样式、挂载当前店铺上下文与全局 Agent 抽屉（所有页面右下角入口）。
import "./globals.css";
import { ShopProvider } from "@/components/shop/shop-context";
import AgentDrawer from "@/components/chat/agent-drawer";

export const metadata = {
  title: "TikTok 跨境电商工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <ShopProvider>
          {children}
          <AgentDrawer />
        </ShopProvider>
      </body>
    </html>
  );
}
