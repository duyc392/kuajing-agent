// 用途：工具状态卡（PRD 故事 8 工具调用可见）：统一渲染 running / error / invalid（结果格式异常）三种非完成态，
// 并导出卡片样式 cardStyle；各专属卡片只负责合法的完成态结果，运行与失败提示不再重复实现。
"use client";

export type ToolStatus = "running" | "error" | "invalid";

export function cardStyle(tone: "blue" | "green" | "red"): string {
  if (tone === "blue") return "rounded-lg border border-[#b8ddd0] bg-[var(--workspace-soft)] px-3 py-2 text-xs text-[#2e6350]";
  if (tone === "red") return "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600";
  return "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700";
}

export default function ToolStatusCard({ label, status, meta, error }: {
  label: string;
  status: ToolStatus;
  meta?: string;
  error?: string;
}) {
  if (status === "running") {
    return <div className={`${cardStyle("blue")} animate-pulse`}>⚙ {label}中…{meta ?? ""}</div>;
  }
  if (status === "error") {
    return <div className={cardStyle("red")}>✗ {label}失败：{error ?? "请重试"}</div>;
  }
  return <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">⚠ {label}结果格式异常，请重新生成。</div>;
}
