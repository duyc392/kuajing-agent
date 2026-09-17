// 用途：内容创作子页④素材需求库（规格 2.6）：列出当前商品从脚本分镜合并生成的镜头执行明细（镜头ID/场景/动作/道具打光/共用脚本/状态），
// 点击状态胶囊按「待拍摄 → 拍摄中 → 已归档复用 → 待拍摄」循环切换并落库；导出按飞书多维表格格式复制 TSV 到剪贴板。
// 结构：数据按钮组合主组件 + 镜头表格子组件，交互按钮各自私有。
"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import { SHOT_REQUIREMENT_STATUSES } from "@/config/content";
import type { ShotRequirementView } from "@/types/content";

const STATUS_CLASS: Record<string, string> = {
  待拍摄: "bg-red-50 text-red-600",
  拍摄中: "bg-[var(--workspace-soft)] text-[#2e6350]",
  已归档复用: "bg-green-50 text-green-700",
};

export default function ShotRequirementsTab({ productId }: { productId: string }) {
  const { currentShopId } = useShops();
  const [shots, setShots] = useState<ShotRequirementView[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setShots(null);
    setError("");
    apiRequest<unknown>("POST", `/api/content/shot-requirements?productId=${productId}&shopId=${currentShopId}`, undefined, controller.signal)
      .then((rows) => {
        if (stale) return;
        if (!Array.isArray(rows)) throw new Error("镜头数据异常");
        setShots(rows as ShotRequirementView[]);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "素材需求加载失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [productId, currentShopId, reloadCount]);

  // 状态循环切换：按白名单顺序取下一状态，ref 锁防连点；成功后本地替换该行，不整表刷新。
  async function handleCycle(shot: ShotRequirementView) {
    if (!currentShopId || busyRef.current) return;
    const index = SHOT_REQUIREMENT_STATUSES.indexOf(shot.status as (typeof SHOT_REQUIREMENT_STATUSES)[number]);
    const next = SHOT_REQUIREMENT_STATUSES[(index + 1) % SHOT_REQUIREMENT_STATUSES.length];
    busyRef.current = true;
    setError("");
    try {
      const row = await apiRequest<ShotRequirementView>("PATCH", `/api/content/shot-requirements/${shot.id}?shopId=${currentShopId}`, { status: next });
      setShots((prev) => (prev ? prev.map((item) => (item.id === row.id ? row : item)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "状态更新失败，请重试");
    } finally {
      busyRef.current = false;
    }
  }

  // 导出：生成飞书多维表格兼容的 TSV 文本复制到剪贴板；剪贴板不可用（非 HTTPS 等）时降级为提示。
  async function handleExport() {
    if (shots === null) return;
    const header = "镜头ID\t拍摄场景\t景别与动作要点\t道具与打光\t共用脚本\t执行状态";
    const rows = shots.map((shot) =>
      [shot.shotCode, shot.scene, shot.actionDescription, shot.propsAndLighting || "待补充", shot.scriptIds.length > 0 ? shot.scriptIds.map((id) => id.slice(-6)).join("、") : "—", shot.status].join("\t"),
    );
    const tsv = [header, ...rows].join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setMessage("已复制执行表到剪贴板（飞书粘贴为表格格式）");
    } catch {
      setError("复制失败：请检查浏览器剪贴板权限");
    }
  }

  if (!currentShopId) {
    return <p className="p-10 text-center text-sm text-[var(--workspace-muted)]">还没有店铺，请先在右上角创建店铺。</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          摄影师与剪辑执行表 {shots !== null && `(已关联 ${shots.length} 个镜头 · 从脚本分镜自动去重合并)`}
        </p>
        <button onClick={() => void handleExport()} className="btn btn-outline btn-sm">
          导出飞书表格
        </button>
      </div>
      {message && <p className="text-sm text-[#2e6350]">{message}</p>}
      {error && <ErrorMessage message={error} onRetry={() => setReloadCount((count) => count + 1)} />}
      {shots === null && !error && <Loading text="加载镜头…" />}
      {shots !== null && !error && shots.length === 0 && (
        <p className="page-card border-dashed p-8 text-center text-sm text-[var(--workspace-muted)]">
          还没有镜头需求。先在「脚本库」确认脚本（或让 AI 生成），系统会自动把分镜合并成拍摄执行表。
        </p>
      )}
      {shots !== null && !error && shots.length > 0 && (
        <ShotTable shots={shots} onCycle={(shot) => void handleCycle(shot)} />
      )}
    </div>
  );
}

function ShotTable({ shots, onCycle }: { shots: ShotRequirementView[]; onCycle: (shot: ShotRequirementView) => void }) {
  return (
    <div className="overflow-x-auto page-card">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--workspace-border)] bg-[#f0f4f1]">
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">镜头ID</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">拍摄场景</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">景别与动作要点</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">道具与打光</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">共用脚本</th>
            <th className="px-3 py-2 text-xs font-medium text-[var(--workspace-muted)]">执行状态</th>
          </tr>
        </thead>
        <tbody>
          {shots.map((shot) => (
            <tr key={shot.id} className="border-b border-[var(--workspace-border)] last:border-b-0">
              <td className="px-3 py-2.5 text-sm font-semibold">#{shot.shotCode}</td>
              <td className="px-3 py-2.5 text-sm text-[#3b534c]">{shot.scene}</td>
              <td className="px-3 py-2.5 text-sm text-[#3b534c]">{shot.actionDescription}</td>
              <td className="max-w-40 px-3 py-2.5 text-sm text-[var(--workspace-muted)]">{shot.propsAndLighting || "待补充"}</td>
              <td className="px-3 py-2.5 text-sm text-[#3b534c]">
                <div className="flex flex-wrap gap-1">
                      {shot.scriptIds.map((scriptId, index) => (
                        <span key={scriptId} className="rounded bg-[#f0f4f1] px-1.5 py-0.5 text-[10px] text-[var(--workspace-muted)]">
                          脚本 {String.fromCharCode(65 + index)}
                        </span>
                  ))}
                  {shot.scriptIds.length === 0 && <span className="text-xs text-gray-400">—</span>}
                </div>
              </td>
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onCycle(shot)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[shot.status] ?? "bg-gray-100 text-gray-500"}`}
                >
                  {shot.status} ↺
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
