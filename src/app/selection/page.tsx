// 用途：选品工作台页（/selection）：挂载选品沙盒 Context 与总体编排（筛选 → 流水线 → 候选表 → 视频透视 → 推进测品）。
import AppShell from "@/components/layout/app-shell";
import { SelectionProvider } from "@/components/selection/selection-context";
import SelectionWorkbench from "@/components/selection/selection-workbench";

export const metadata = {
  title: "选品调研 · TikTok 跨境电商工作台",
};

export default function SelectionPage() {
  return (
    <AppShell>
      <SelectionProvider>
        <SelectionWorkbench />
      </SelectionProvider>
    </AppShell>
  );
}
