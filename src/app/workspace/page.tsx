// 用途：工作台首页与聊天视图组装；显式区分新建空历史与已有对话。
"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import Sidebar from "@/components/layout/sidebar";
import ChatPanel from "@/components/chat/chat-panel";
import ResultPanel from "@/components/chat/result-panel";
import WorkspaceHome from "@/components/chat/workspace-home";
import { useShops } from "@/components/shop/shop-context";
import type { ConversationInitialization } from "@/types";

interface Selection extends ConversationInitialization { id: string; shopId: string }
interface ConversationViewProps {
  active: Selection;
  scriptId: string | null;
  onBack: () => void;
  onComplete: () => void;
  onConfirmed: () => void;
  onScript: (id: string | null) => void;
}
function ConversationView({ active, scriptId, onBack, onComplete, onConfirmed, onScript }: ConversationViewProps) {
  const [mobileView, setMobileView] = useState<"chat" | "result">("chat");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--workspace-border)] bg-white px-4 py-2">
        <button type="button" className="text-sm text-[#246750] hover:underline" onClick={onBack}>返回工作台</button>
        <div className="flex gap-1 lg:hidden" role="tablist" aria-label="工作区视图">
          <button type="button" role="tab" aria-selected={mobileView === "chat"} onClick={() => setMobileView("chat")}
            className={`rounded-full px-3 py-1 text-xs ${mobileView === "chat" ? "bg-[var(--workspace-soft)] font-semibold text-[#2e6350]" : "text-[var(--workspace-muted)]"}`}>对话</button>
          <button type="button" role="tab" aria-selected={mobileView === "result"} onClick={() => setMobileView("result")}
            className={`rounded-full px-3 py-1 text-xs ${mobileView === "result" ? "bg-[var(--workspace-soft)] font-semibold text-[#2e6350]" : "text-[var(--workspace-muted)]"}`}>结果</button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div className={`min-h-0 ${mobileView === "result" ? "hidden lg:block" : ""}`}>
          <ChatPanel conversationId={active.id} initialMessages={active.initialMessages} autoSendMessage={active.autoSendMessage}
            onUserMessageConfirmed={onConfirmed} onTurnComplete={onComplete} onScriptResult={onScript} />
        </div>
        <div className={`min-h-0 border-l border-[var(--workspace-border)] ${mobileView === "chat" ? "hidden lg:block" : ""}`}>
          <ResultPanel scriptId={scriptId} shopId={active.shopId} />
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const { currentShopId } = useShops();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [scriptResultId, setScriptResultId] = useState<string | null>(null);
  const active = selection?.shopId === currentShopId ? selection : null;
  useEffect(() => { setSelection(null); }, [currentShopId]);
  useEffect(() => { setScriptResultId(null); }, [active?.id]);
  function select(id: string, initialization?: ConversationInitialization) {
    if (currentShopId) setSelection({ id, shopId: currentShopId, ...initialization });
  }
  function handleDeleted(id: string) {
    setSelection((current) => current?.id === id ? null : current);
  }
  function confirmFirstMessage() {
    setSelection((current) => current?.id === active?.id && current?.shopId === currentShopId
      ? { ...current, autoSendMessage: undefined } : current);
  }
  return (
    <AppShell sidebar={active ? <Sidebar key={currentShopId} activeId={active.id} onSelect={select} onDeleted={handleDeleted} refreshSignal={refreshSignal} /> : undefined}>
      {active ? <ConversationView key={`${active.shopId}:${active.id}`} active={active} scriptId={scriptResultId}
        onBack={() => setSelection(null)} onComplete={() => setRefreshSignal((count) => count + 1)}
        onConfirmed={confirmFirstMessage} onScript={setScriptResultId} />
        : <WorkspaceHome key={currentShopId} onSelect={select} refreshSignal={refreshSignal} />}
    </AppShell>
  );
}
