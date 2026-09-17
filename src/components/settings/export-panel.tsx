// 用途：数据导出面板（PRD 故事 38）：把当前店铺的数据库记录一键导出为 Excel 备份并下载；
// 同时提示 SQLite 文件、图片目录与技能目录需另行复制才能完整迁移。
"use client";

import { useRef, useState } from "react";
import { downloadFile } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import ErrorMessage from "@/components/shared/error-message";

// 用本地时间生成文件名时间戳（如 20240115-1030），便于区分多次备份。
function exportFilename(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `工作台数据备份-${stamp}.xlsx`;
}

// 导出为本地生成 Excel 耗时比普通接口长，单独给 60 秒，避免大数据量下 15 秒默认超时误报。
const EXPORT_TIMEOUT_MS = 60_000;

export default function ExportPanel() {
  const { currentShopId } = useShops();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const exportingRef = useRef(false);

  async function handleExport() {
    if (exportingRef.current) return;
    if (!currentShopId) {
      setError("当前没有店铺，无法导出");
      return;
    }
    exportingRef.current = true;
    setExporting(true);
    setError("");
    setDone(false);
    try {
      const path = `/api/export?shopId=${encodeURIComponent(currentShopId)}`;
      await downloadFile(path, exportFilename(), EXPORT_TIMEOUT_MS);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败，请重试");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  return (
    <div className="page-card p-6">
      <p className="text-sm text-gray-600">
        把当前店铺的数据库记录（商品、文案、脚本、对话、记忆、生成记录等）导出为一个 Excel 文件，用于备份。
      </p>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={exporting}
        className="btn btn-primary mt-4"
      >
        {exporting ? "导出中…" : "导出 Excel 备份"}
      </button>
      {done && !error && <p className="mt-3 text-xs text-green-600">✓ 导出完成，文件已开始下载。</p>}
      {error && <div className="mt-3"><ErrorMessage message={error} /></div>}
      <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
        提示：本地数据库文件（SQLite）包含全部店铺数据，可整体复制作为完整备份；商品图片文件与技能正文不在 Excel 内，完整迁移还需一并复制 public/generated/ 与 skills/ 目录。
      </p>
    </div>
  );
}
