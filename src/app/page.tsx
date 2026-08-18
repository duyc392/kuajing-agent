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

  useEffect(() => {
    apiRequest<KeysStatus>("GET", "/api/keys")
      .then(async (keys) => {
        if (!keys.allConfigured) {
          router.replace("/onboarding");
          return;
        }
        const shops = await apiRequest<ShopOverview[]>("GET", "/api/shops");
        router.replace(shops.length > 0 ? "/workspace" : "/create-shop");
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      {error ? (
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Link href="/onboarding" className="mt-3 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm text-white hover:bg-blue-700">
            手动打开配置页
          </Link>
        </div>
      ) : (
        <p className="text-sm text-gray-500">正在进入工作台…</p>
      )}
    </main>
  );
}
