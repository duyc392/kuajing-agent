// 用途：已确认设计的工作台首页；复用输入框、快捷指令和既有对话列表/新建逻辑。
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatInput } from "@/components/chat/chat-input";
import QuickCommands from "@/components/chat/quick-commands";
import { useConversationList } from "@/components/chat/use-conversation-list";
import { useShops } from "@/components/shop/shop-context";
import ErrorMessage from "@/components/shared/error-message";
import Loading from "@/components/shared/loading";
import WorkspaceIcon from "@/components/shared/workspace-icon";
import { formatRelativeTime } from "@/lib/time";
import type { ConversationSummary } from "@/types";

interface WorkspaceHomeProps {
  onSelect: (id: string, content?: string) => void;
  refreshSignal: number;
}

function RecentWork({ list, onSelect }: { list: ConversationSummary[]; onSelect: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? list : list.slice(0, 3);
  return (
    <section className="workspace-recent" aria-labelledby="recent-work-heading">
      <div className="workspace-section-heading">
        <h2 id="recent-work-heading">最近工作</h2>
        {list.length > 3 && <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "查看全部"}<WorkspaceIcon name="arrow" /></button>}
      </div>
      {list.length === 0 ? <p className="workspace-empty">还没有对话，从上方输入一个任务开始。</p> : (
        <ul className="workspace-recent-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item.id)}>
                <span className="workspace-document-icon"><WorkspaceIcon name="document" /></span>
                <span className="workspace-recent-copy"><span>{item.title}</span><time dateTime={item.updatedAt}>{formatRelativeTime(item.updatedAt)}</time></span>
                <WorkspaceIcon name="chevron" className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function WorkspaceHome({ onSelect, refreshSignal }: WorkspaceHomeProps) {
  const { currentShopId, shops } = useShops();
  const shop = shops.find((item) => item.id === currentShopId);
  const [input, setInput] = useState("");
  const { list, error, creating, handleCreate, retry } = useConversationList(currentShopId, onSelect, refreshSignal);
  const send = (content: string) => { if (content.trim()) void handleCreate(content.trim()); };
  return (
    <div className="workspace-home">
      <div className="workspace-start">
        <p className="workspace-intro">你的跨境运营工作台</p>
        <h1>今天，想推进哪件事？</h1>
        <p className="workspace-subtitle">从选品到内容，把具体任务交给 Agent。</p>
        <ChatInput appearance="home" shopName={shop?.name} value={input} onChange={setInput}
          disabled={creating || !currentShopId} busy={creating} onSubmit={() => send(input)} />
        {error && <div className="workspace-home-error"><ErrorMessage message={error} onRetry={list === null ? retry : undefined} /></div>}
        <QuickCommands appearance="home" disabled={creating || !currentShopId} onSend={send} />
      </div>
      {!currentShopId ? <p className="workspace-empty">还没有店铺，<Link href="/create-shop">创建店铺后开始使用</Link>。</p>
        : list !== null ? <RecentWork list={list} onSelect={onSelect} />
        : !error && <div className="workspace-recent"><Loading text="正在加载最近工作…" /></div>}
      <footer className="workspace-footer"><span><WorkspaceIcon name="computer" />本地工作区</span><span>跨境 Agent</span></footer>
    </div>
  );
}
