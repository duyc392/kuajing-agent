// 用途：脚本详情加载钩子：按脚本与当前店铺拉取详情，过期请求作废 + 取消信号，提供刷新入口。
"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { ScriptDetailView } from "@/types";

export function useScriptDetail(scriptId: string | null, currentShopId: string | null) {
  const [script, setScript] = useState<ScriptDetailView | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!currentShopId || scriptId === null) {
      setScript(null);
      setError("");
      return;
    }
    let stale = false;
    const controller = new AbortController();
    setScript(null);
    setError("");
    apiRequest<unknown>("GET", `/api/scripts/${scriptId}?shopId=${currentShopId}`, undefined, controller.signal)
      .then((row) => {
        if (stale) return;
        if (typeof row !== "object" || row === null) throw new Error("脚本数据异常");
        setScript(row as ScriptDetailView);
      })
      .catch((e: Error) => { if (!stale) setError(e.message || "脚本加载失败"); });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [scriptId, currentShopId, reloadCount]);

  return { script, error, refresh: () => setReloadCount((count) => count + 1) };
}
