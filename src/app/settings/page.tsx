// 用途：设置页入口，导航到五个板块：店铺管理、模型与 API Key、Agent 记忆、技能管理、数据导出。
import Link from "next/link";
import AppShell from "@/components/layout/app-shell";

export const metadata = {
  title: "设置 · TikTok 跨境电商工作台",
};

const SECTIONS = [
  { href: "/settings/shops", title: "店铺管理", desc: "添加、编辑、归档店铺，切换当前店铺" },
  { href: "/settings/models", title: "模型与 API Key", desc: "对话、生图、FastMoss 三个 Key 与模型配置" },
  { href: "/settings/memory", title: "Agent 记忆", desc: "分类查看、编辑、删除店铺画像与偏好记忆" },
  { href: "/settings/skills", title: "技能管理", desc: "查看、启用、禁用、删除 Agent 沉淀的技能" },
  { href: "/settings/export", title: "数据导出", desc: "一键导出 Excel 备份文件" },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">设置</h1>
        <p className="mt-2 text-sm text-gray-500">五个管理板块，点击进入。</p>
        <div className="mt-6 grid gap-3">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <span>
                <span className="block text-base font-semibold text-gray-900">{section.title}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{section.desc}</span>
              </span>
              <span className="text-gray-300">→</span>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
