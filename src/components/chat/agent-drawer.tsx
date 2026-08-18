// 用途：全局 Agent 侧边抽屉：所有页面右下角悬浮入口，点击后从右侧滑出对话面板，不跳转当前页面（对话功能为下一项交付）。
"use client";

import { useState } from "react";

export default function AgentDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开 Agent 对话面板"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg hover:bg-blue-700"
      >
        AI
      </button>
      <div className={`fixed inset-y-0 right-0 z-50 w-96 transform border-l border-gray-200 bg-white shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="text-sm font-semibold text-gray-900">Agent 助手</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭面板" className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            ✕
          </button>
        </header>
        <div className="flex h-[calc(100%-53px)] items-center justify-center p-6 text-center text-sm text-gray-400">
          对话功能即将在这里上线（下一项开发）。
        </div>
      </div>
    </>
  );
}
