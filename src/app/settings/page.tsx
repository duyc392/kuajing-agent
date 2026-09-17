// 用途：设置页入口：重定向到店铺管理分区（左侧分区导航由 settings-shell 常驻提供）。
import { redirect } from "next/navigation";

export const metadata = {
  title: "设置 · TikTok 跨境电商工作台",
};

export default function SettingsPage() {
  redirect("/settings/shops");
}
