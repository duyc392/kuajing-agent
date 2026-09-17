// 用途：工作台首页与既有对话视图切换；对话态为「对话 + 只读结果预览」双栏（窄屏切换显示），店铺隔离与首条消息发送沿用现有模式。
"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import Sidebar from "@/components/layout/sidebar";
import ChatPanel from "@/components/chat/chat-panel";
import ResultPanel from "@/components/chat/result-panel";
import WorkspaceHome from "@/components/chat/workspace-home";
import { useShops } from "@/components/shop/shop-context";

interface Selection { id: string; shopId: string; content?: string }

export default function WorkspacePage() {
  const { currentShopId } = useShops();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [scriptResultId, setScriptResultId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "result">("chat");
  const active = selection?.shopId === currentShopId ? selection : null;
  useEffect(() => { setSelection(null); }, [currentShopId]);
  // 切换对话时清空旧结果预览（历史加载完成后由 ChatPanel 恢复该对话自己的最新脚本）。
  useEffect(() => { setScriptResultId(null); setMobileView("chat"); }, [active?.id]);

  function select(id: string, content?: string) {
    if (currentShopId) setSelection({ id, shopId: currentShopId, content });
  }
  function finishTurn() {
    setSelection((current) => current && current.id === active?.id ? { ...current, content: undefined } : current);
    setRefreshSignal((count) => count + 1);
  }
  function handleScriptResult(scriptId: string | null) {
    setScriptResultId(scriptId);
  }

  return (
    <AppShell sidebar={active ? <Sidebar key={currentShopId} activeId={active.id} onSelect={select} refreshSignal={refreshSignal} /> : undefined}>
      {active ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--workspace-border)] bg-white px-4 py-2">
            <button type="button" className="text-sm text-[#246750] hover:underline" onClick={() => setSelection(null)}>返回工作台</button>
            <div className="flex gap-1 lg:hidden" role="tablist" aria-label="工作区视图">
              <button type="button" role="tab" aria-selected={mobileView === "chat"} onClick={() => setMobileView("chat")}
                className={`rounded-full px-3 py-1 text-xs ${mobileView === "chat" ? "bg-[var(--workspace-soft)] font-semibold text-[#2e6350]" : "text-[var(--workspace-muted)]"}`}>对话</button>
              <button type="button" role="tab" aria-selected={mobileView === "result"} onClick={() => setMobileView("result")}
                className={`rounded-full px-3 py-1 text-xs ${mobileView === "result" ? "bg-[var(--workspace-soft)] font-semibold text-[#2e6350]" : "text-[var(--workspace-muted)]"}`}>结果</button>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
            <div className={`min-h-0 ${mobileView === "result" ? "hidden lg:block" : ""}`}>
              <ChatPanel key={active.id} conversationId={active.id} autoSendMessage={active.content} onTurnComplete={finishTurn} onScriptResult={handleScriptResult} />
            </div>
            <div className={`min-h-0 border-l border-[var(--workspace-border)] ${mobileView === "chat" ? "hidden lg:block" : ""}`}>
              <ResultPanel scriptId={scriptResultId} shopId={currentShopId} />
            </div>
          </div>
        </div>
      ) : <WorkspaceHome key={currentShopId} onSelect={select} refreshSignal={refreshSignal} />}
    </AppShell>
  );
}
