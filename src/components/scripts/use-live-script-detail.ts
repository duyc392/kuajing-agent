// 用途：直播脚本详情加载钩子：按脚本与当前店铺拉取详情，过期请求作废 + 取消信号，提供刷新入口。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { LiveScriptDetailView } from "@/types";

export function useLiveScriptDetail(scriptId: string, currentShopId: string | null) {
  const [script, setScript] = useState<LiveScriptDetailView | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setScript(null);
    setError("");
    apiRequest<unknown>("GET", `/api/live-scripts/${scriptId}?shopId=${currentShopId}`, undefined, controller.signal)
      .then((row) => {
        if (stale) return;
        if (typeof row !== "object" || row === null) throw new Error("直播脚本数据异常");
        setScript(row as LiveScriptDetailView);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "直播脚本加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [scriptId, currentShopId, reloadCount]);

  return { script, error, refresh: () => setReloadCount((count) => count + 1) };
}
