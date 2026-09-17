// 用途：对话、抽屉和首页共用输入框；首页只切换外观，不另写发送协议。
"use client";

import React from "react";
import WorkspaceIcon from "@/components/shared/workspace-icon";

interface ChatInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  onSubmit: () => void;
  appearance?: "default" | "home";
  shopName?: string;
  busy?: boolean;
}

function InputAction({ home, disabled, empty, busy }: { home: boolean; disabled: boolean; empty: boolean; busy: boolean }) {
  return (
    <button type="submit" disabled={disabled || empty}
      className={home ? "workspace-submit" : "rounded-xl bg-[var(--workspace-primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#315647] disabled:opacity-50"}>
      {busy ? (home ? "正在开始…" : "回复中…") : home ? "开始任务" : "发送"}
      {home && <span><WorkspaceIcon name="arrow" /></span>}
    </button>
  );
}

export function ChatInput({ value, onChange, disabled, onSubmit, appearance = "default", shopName, busy = disabled }: ChatInputProps) {
  const home = appearance === "home";
  return (
    <div className={home ? "workspace-composer" : "border-t border-gray-200 bg-white p-4"}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
        className={home ? "workspace-composer-form" : "mx-auto flex w-full max-w-3xl items-end gap-3"}>
        <textarea
          aria-label={home ? "描述你的任务" : "输入消息"}
          className={home ? "workspace-task-input" : "min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--workspace-border)] px-3 py-2.5 text-sm focus:border-[#41876d] focus:outline-none focus:ring-1 focus:ring-[#41876d]"}
          rows={2} maxLength={20000}
          placeholder={home ? "描述你的任务，例如：为润唇膏写一条英文视频脚本" : "输入消息，Enter 发送（Shift + Enter 换行）"}
          value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        {home && <div className="workspace-composer-context"><WorkspaceIcon name="store" /><span>当前店铺：{shopName ?? "尚无店铺"}</span></div>}
        <InputAction home={home} disabled={disabled} empty={value.trim() === ""} busy={busy} />
      </form>
      {home && <p className="workspace-input-hint">Enter 发送 · Shift + Enter 换行</p>}
    </div>
  );
}
