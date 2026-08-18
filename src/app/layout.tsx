// 用途：根布局，定义全局 HTML 结构并引入全局样式（后续在此挂载全局 Agent 抽屉）。
import "./globals.css";

export const metadata = {
  title: "TikTok 跨境电商工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
