// 用途：工作台对话右侧只读结果面板：展示最新生成的视频脚本（分镜结构），复用脚本详情接口；
// 分镜为只读呈现（API 契约边界：人工编辑仅开放 type/hook/cta/style，在脚本详情页进行），调整入口交给 Agent。
"use client";

import WorkspaceIcon from "@/components/shared/workspace-icon";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { useScriptDetail } from "@/components/scripts/use-script-detail";
import type { ScriptShot } from "@/types";

function ShotRow({ index, shot }: { index: number; shot: ScriptShot }) {
  return (
    <tr className="border-b border-[var(--workspace-border)] last:border-b-0">
      <td className="px-3 py-2.5 text-sm font-semibold">#{String(index + 1).padStart(2, "0")}</td>
      <td className="px-3 py-2.5 text-sm text-[#3b534c]">{shot.seconds}s</td>
      <td className="px-3 py-2.5 text-sm text-[#3b534c]">{shot.scene}</td>
      <td className="px-3 py-2.5 text-sm text-[var(--workspace-muted)]">{shot.subtitle}</td>
    </tr>
  );
}

export default function ResultPanel({ scriptId, shopId }: { scriptId: string | null; shopId: string | null }) {
  const { script, error, refresh } = useScriptDetail(scriptId, shopId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--workspace-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--workspace-border)] px-4 py-3">
        <h2 className="text-sm font-semibold">结果预览</h2>
        {script !== null && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-agent-drawer"))}
            className="btn btn-outline !min-h-0 !px-2.5 !py-1 text-[11px]"
          >
            让 Agent 调整
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {scriptId === null && (
          <div className="grid h-full place-content-center gap-2 px-6 text-center">
            <WorkspaceIcon name="document" width="30" height="30" className="mx-auto text-[#9ecdb9]" />
            <p className="text-sm text-[var(--workspace-muted)]">让 Agent 写一个视频脚本，</p>
            <p className="text-sm text-[var(--workspace-muted)]">最新结果会显示在这里，历史对话的结果也会自动恢复。</p>
          </div>
        )}
        {scriptId !== null && script === null && !error && <Loading text="加载结果…" />}
        {scriptId !== null && error !== "" && <div className="p-4"><ErrorMessage message={error} onRetry={refresh} /></div>}
        {script !== null && (
          <div className="grid gap-3 p-4">
            <div>
              <p className="text-base font-semibold">{script.type} · {script.duration} 秒</p>
              <p className="mt-0.5 text-xs text-[var(--workspace-muted)]">第 {script.version} 版 · 更新于 {script.updatedAt.slice(0, 10)}</p>
            </div>
            <div className="page-card grid gap-2 p-3 text-sm">
              <p><span className="text-[var(--workspace-muted)]">钩子：</span>{script.hook}</p>
              <p><span className="text-[var(--workspace-muted)]">行动号召：</span>{script.cta}</p>
            </div>
            <div className="page-card overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--workspace-border)] bg-[#f0f4f1]">
                    <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">镜头</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">时长</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">画面与动作</th>
                    <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">字幕</th>
                  </tr>
                </thead>
                <tbody>
                  {script.shots.map((shot, index) => (
                    <ShotRow key={index} index={index} shot={shot} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--workspace-muted)]">分镜为只读展示；需要调整时长、台词或画面，请让 Agent 重新生成。</p>
          </div>
        )}
      </div>
    </div>
  );
}
