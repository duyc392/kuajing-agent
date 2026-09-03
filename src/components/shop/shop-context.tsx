// 用途：当前店铺上下文：全局保存"当前操作的店铺"并持久化到浏览器本地存储，切换后所有页面数据跟随切换。
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { apiRequest } from "@/lib/api-client";
import type { ShopOverview } from "@/types";

const STORAGE_KEY = "kuajing.currentShopId";

// 当前店铺 ID 的 localStorage 键（供其他客户端模块只读使用，如 Agent 指令队列按店入队）。
export const CURRENT_SHOP_STORAGE_KEY = STORAGE_KEY;

interface ShopsContextValue {
  shops: ShopOverview[];
  currentShopId: string | null;
  loading: boolean;
  error: string | null;
  setCurrentShopId: (id: string) => void;
  refresh: () => Promise<void>;
}

const ShopsContext = createContext<ShopsContextValue | null>(null);

function pickValidId(list: ShopOverview[]): string | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && list.some((shop) => shop.id === stored)) return stored;
  return list[0]?.id ?? null;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [shops, setShops] = useState<ShopOverview[]>([]);
  const [currentShopId, setCurrentShopState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await apiRequest<ShopOverview[]>("GET", "/api/shops");
      setShops(list);
      const valid = pickValidId(list);
      if (valid) window.localStorage.setItem(STORAGE_KEY, valid);
      setCurrentShopState(valid);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "店铺列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setCurrentShopId = useCallback((id: string) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    setCurrentShopState(id);
  }, []);

  return (
    <ShopsContext.Provider value={{ shops, currentShopId, loading, error, setCurrentShopId, refresh }}>
      {children}
    </ShopsContext.Provider>
  );
}

export function useShops(): ShopsContextValue {
  const context = useContext(ShopsContext);
  if (!context) throw new Error("useShops 必须在 ShopProvider 内使用");
  return context;
}
