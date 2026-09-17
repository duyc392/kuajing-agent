// 用途：店铺管理页（设置分组）：切换当前店铺、编辑资料、归档 / 恢复、新建入口。
import SettingsShell from "@/components/settings/settings-shell";
import ShopManager from "@/components/shop/shop-manager";

export const metadata = {
  title: "店铺管理 · TikTok 跨境电商工作台",
};

export default function SettingsShopsPage() {
  return (
    <SettingsShell title="店铺管理" subtitle="切换当前店铺、编辑资料、归档不再经营的店铺；所有页面数据都会跟随当前店铺切换。">
      <ShopManager />
    </SettingsShell>
  );
}
