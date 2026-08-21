// 用途：全局 Agent 抽屉：所有页面右下角悬浮入口，点击后从右侧滑出对话面板，不跳转当前页。
// 面板内复用 ChatPanel 的完整对话能力；打开时只读取当前店铺最近一次对话，无对话则展示欢迎态，用户首次发送时才创建对话。
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useShops } from "@/components/shop/shop-context";
import ChatPanel, { ChatInput } from "@/components/chat/chat-panel";
import QuickCommands from "@/components/chat/quick-commands";
import Loading from "@/components/shared/loading";
import ErrorMessage from "@/components/shared/error-message";
import type { ConversationSummary } from "@/types";

// 读取当前店铺最近一次对话（不自动创建）：打开抽屉或切换店铺后重新加载，已有活动对话则不重复加载。
function useConversationLoad(open: boolean, currentShopId: string | null) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [boundShopId, setBoundShopId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!open || !currentShopId) return;
    if (conversationId !== null && boundShopId === currentShopId) return;
    let stale = false;
    const controller = new AbortController();
    setError("");
    apiRequest<ConversationSummary[]>("GET", `/api/conversations?shopId=${currentShopId}`, undefined, controller.signal)
      .then((list) => {
        if (stale) return;
        setConversationId(list[0]?.id ?? null);
        setBoundShopId(currentShopId);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message || "对话初始化失败");
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [open, currentShopId, conversationId, boundShopId, reloadCount]);

  const resolved = boundShopId === currentShopId;
  const activeConversationId = currentShopId !== null && resolved ? conversationId : null;

  return {
    activeConversationId,
    resolved,
    error,
    adopt: (id: string, shopId: string) => {
      setConversationId(id);
      setBoundShopId(shopId);
    },
    retry: () => {
      setConversationId(null);
      setBoundShopId(null);
      setReloadCount((count) => count + 1);
    },
  };
}

interface PendingSend {
  conversationId: string;
  content: string;
}

// 抽屉对话状态：组合"读取最近对话"与"首次发送才创建"；pending 记录待自动发送的首条消息，按对话 ID 匹配防止发错对话。
function useDrawerConversation(open: boolean, currentShopId: string | null) {
  const load = useConversationLoad(open, currentShopId);
  const [pending, setPending] = useState<PendingSend | null>(null);

  async function startConversation(content: string): Promise<void> {
    if (!currentShopId) throw new Error("当前没有店铺，无法开始对话");
    const created = await apiRequest<ConversationSummary>("POST", "/api/conversations", { shopId: currentShopId });
    load.adopt(created.id, currentShopId);
    setPending({ conversationId: created.id, content });
  }

  const autoSendMessage =
    pending !== null && pending.conversationId === load.activeConversationId ? pending.content : undefined;

  return {
    activeConversationId: load.activeConversationId,
    resolved: load.resolved,
    autoSendMessage,
    error: load.error,
    startConversation,
    clearPendingMessage: () => setPending(null),
    retry: load.retry,
  };
}

// 无对话时的欢迎态：复用 ChatInput 与快捷指令，首次发送时创建对话并把首条消息交给 ChatPanel 自动发送。
function EmptyChat({ onSend }: { onSend: (content: string) => Promise<void> }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sendingRef = useRef(false);

  async function submit(content: string) {
    if (content === "" || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      await onSend(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建对话失败");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleSubmit() {
    void submit(input.trim());
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-gray-700">开始和 Agent 对话</p>
        <p className="text-xs text-gray-400">输入问题即可，回复会自动基于当前店铺上下文。</p>
      </div>
      {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}
      <QuickCommands disabled={sending} onSend={(prompt) => void submit(prompt)} />
      <ChatInput value={input} onChange={setInput} disabled={sending} onSubmit={handleSubmit} />
    </div>
  );
}

interface DrawerContentProps {
  currentShopId: string | null;
  error: string;
  resolved: boolean;
  activeConversationId: string | null;
  autoSendMessage: string | undefined;
  onRetry: () => void;
  onStart: (content: string) => Promise<void>;
  onTurnComplete: () => void;
}

function DrawerContent(props: DrawerContentProps) {
  if (props.currentShopId === null) {
    return <p className="p-6 text-center text-sm text-gray-400">还没有店铺，请先在右上角创建店铺。</p>;
  }
  if (props.activeConversationId !== null) {
    return (
      <ChatPanel
        conversationId={props.activeConversationId}
        autoSendMessage={props.autoSendMessage}
        onTurnComplete={props.onTurnComplete}
      />
    );
  }
  if (props.error) return <div className="p-4"><ErrorMessage message={props.error} onRetry={props.onRetry} /></div>;
  if (props.resolved) return <EmptyChat onSend={props.onStart} />;
  return <Loading text="正在准备对话…" />;
}

const TITLE_ID = "agent-drawer-title";

interface DrawerPanelProps {
  open: boolean;
  onClose: () => void;
  panelRef: React.Ref<HTMLDivElement>;
  closeRef: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}

function DrawerPanel({ open, onClose, panelRef, closeRef, children }: DrawerPanelProps) {
  return (
    <div
      id="agent-drawer-panel"
      ref={panelRef}
      role="dialog"
      aria-labelledby={TITLE_ID}
      aria-hidden={!open}
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-200 sm:w-96 ${open ? "translate-x-0" : "translate-x-full"}`}
    >
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span id={TITLE_ID} className="text-sm font-semibold text-gray-900">Agent 助手</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭面板" className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600">✕</button>
      </header>
      <div className="min-h-0 flex-1 bg-gray-50">{children}</div>
    </div>
  );
}

// 抽屉无障碍与关闭行为：Escape 关闭；打开聚焦关闭按钮、关闭把焦点还给入口按钮；关闭时面板 inert（移出无障碍树与 Tab 顺序）。
function useDrawerA11y(
  open: boolean,
  entryRef: React.RefObject<HTMLButtonElement | null>,
  closeRef: React.RefObject<HTMLButtonElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
    if (open) {
      wasOpenRef.current = true;
      closeRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      entryRef.current?.focus();
    }
  }, [open, entryRef, closeRef, panelRef]);
}

export default function AgentDrawer() {
  const [open, setOpen] = useState(false);
  const { currentShopId } = useShops();
  const drawer = useDrawerConversation(open, currentShopId);
  const entryRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDrawerA11y(open, entryRef, closeRef, panelRef, close);

  return (
    <>
      <button
        ref={entryRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开 Agent 对话面板"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="agent-drawer-panel"
        tabIndex={open ? -1 : 0}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg hover:bg-blue-700"
      >
        AI
      </button>
      <DrawerPanel open={open} onClose={close} panelRef={panelRef} closeRef={closeRef}>
        <DrawerContent
          currentShopId={currentShopId}
          error={drawer.error}
          resolved={drawer.resolved}
          activeConversationId={drawer.activeConversationId}
          autoSendMessage={drawer.autoSendMessage}
          onRetry={drawer.retry}
          onStart={drawer.startConversation}
          onTurnComplete={drawer.clearPendingMessage}
        />
      </DrawerPanel>
    </>
  );
}
