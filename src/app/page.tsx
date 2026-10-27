// 用途：首页入口：按本地状态自动分流——未配 Key 去 /onboarding，无店铺去 /create-shop，否则进 /workspace。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import type { KeysStatus, ShopOverview } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setError("");
    apiRequest<KeysStatus>("GET", "/api/keys", undefined, controller.signal)
      .then(async (keys) => {
        if (stale) return;
        if (!keys.allConfigured) {
          router.replace("/onboarding");
          return;
        }
        const shops = await apiRequest<ShopOverview[]>("GET", "/api/shops", undefined, controller.signal);
        if (!stale) router.replace(shops.length > 0 ? "/workspace" : "/create-shop");
      })
      .catch((e: Error) => { if (!stale) setError(e.message); });
    return () => { stale = true; controller.abort(); };
  }, [router, revision]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      {error ? (
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" onClick={() => setRevision((count) => count + 1)} className="mt-3 mr-3 rounded-lg border px-5 py-2 text-sm">重试进入工作台</button>
          <Link href="/onboarding" className="mt-3 inline-block rounded-lg bg-[var(--workspace-primary)] px-5 py-2 text-sm text-white hover:bg-[#315647]">
            手动打开配置页
          </Link>
        </div>
      ) : (
        <p className="text-sm text-gray-500">正在进入工作台…</p>
      )}
    </main>
  );
}
