// 用途：组件/店铺实例的取消边界；首次事件和异步快照都从当前 effect 取有效信号。
"use client";
import { useEffect, useRef } from "react";

export interface ChatLifetime { controller: AbortController; key: string }

export function useChatLifetime(key: string) {
  const current = useRef<ChatLifetime | null>(null);
  const renderedKey = useRef(key);
  renderedKey.current = key;
  useEffect(() => {
    const lifetime = { key, controller: new AbortController() };
    current.current = lifetime;
    return () => { lifetime.controller.abort(); if (current.current === lifetime) current.current = null; };
  }, [key]);
  return {
    current,
    valid: (life: ChatLifetime) => current.current === life && renderedKey.current === life.key && !life.controller.signal.aborted,
  };
}
