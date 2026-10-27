import test from "node:test";
import assert from "node:assert/strict";
import { useChatSend } from "./use-chat-send";
import { useConversationMessages } from "./use-conversation-messages";
import { ChatStreamError } from "@/lib/api-stream";
import { deferred, flush, mountHook } from "./chat-test-utils";
import type { ChatStreamEvent, ConversationInitialization, MessageView } from "@/types";

type Args = Parameters<typeof useChatSend>[0];
type Runtime = NonNullable<Parameters<typeof useChatSend>[1]>;
interface Props extends ConversationInitialization { shopId: string; conversationId: string }
const user: MessageView = { id: "u", role: "user", content: "保留原文", createdAt: "2026-10-27" };
const agent: MessageView = { ...user, id: "a", role: "agent", content: "完成" };
const fresh: Props = { shopId: "shop-a", conversationId: "new", initialMessages: [] };
const identity: Runtime["buildContent"] = async (content) => content;
function successful(events: (event: ChatStreamEvent) => void) {
  events({ type: "user", message: user });
  events({ type: "done", agentMessage: agent });
}
async function mountChat(props: Props, runtime: Runtime, callbacks: Partial<Args> = {}) {
  return mountHook((current: Props) => {
    const history = useConversationMessages(current.conversationId, current.shopId, current.initialMessages);
    const chat = useChatSend({ ...current, ...callbacks, pathname: "/workspace", messages: history.messages, setMessages: history.setMessages }, runtime);
    return { history, chat };
  }, props);
}

test("真实 StrictMode 首条只 POST 一次，新建不 GET，首个 signal 有效", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("新建不能 GET"); };
  let posts = 0, confirms = 0, finishes = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: identity,
    stream: async (_path, _body, events, signal) => {
      posts++;
      assert.ok(signal);
      assert.equal(signal.aborted, false);
      successful(events);
    },
  }, { onUserMessageConfirmed: () => { confirms++; }, onTurnComplete: () => { finishes++; } });
  try {
    assert.equal(posts, 1);
    assert.equal(confirms, 1);
    assert.equal(finishes, 1);
    assert.equal(mounted.value().chat.input, "");
    assert.deepEqual(mounted.value().history.messages?.map((row) => row.id), ["u", "a"]);
    await mounted.update({ ...fresh, autoSendMessage: user.content });
    assert.equal(posts, 1);
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});

test("空新建不发请求；既有历史 ready 前发送被阻止，404 不当空历史", async () => {
  const original = globalThis.fetch;
  const pending = deferred<Response>();
  const paths: string[] = [];
  globalThis.fetch = async (path) => { paths.push(String(path)); return (await pending.promise).clone(); };
  let posts = 0;
  const runtime: Runtime = { buildContent: identity, stream: async () => { posts++; } };
  const empty = await mountChat(fresh, runtime);
  assert.deepEqual(paths, []);
  assert.equal(posts, 0);
  await empty.unmount();
  const old = await mountChat({ shopId: "shop-a", conversationId: "old" }, runtime);
  try {
    assert.equal(old.value().history.messages, null);
    await flush(async () => assert.equal(await old.value().chat.send("普通和快捷均走此入口"), "blocked"));
    assert.equal(posts, 0);
    assert.ok(paths.every((path) => path === "/api/conversations/old?shopId=shop-a"));
    await flush(() => pending.resolve(Response.json({ error: "对话不存在" }, { status: 404 })));
    assert.equal(old.value().history.messages, null);
    assert.match(old.value().history.error, /不存在/);
  } finally { await old.unmount(); globalThis.fetch = original; }
});

test("首条明确拒绝保留原文与 pending，显式重试成功才 user 确认", async () => {
  let posts = 0, confirms = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: identity, stream: async (_path, _body, events) => {
      posts++;
      if (posts === 1) throw new ChatStreamError("尚未配置", "rejected");
      successful(events);
    },
  }, { onUserMessageConfirmed: () => { confirms++; } });
  try {
    assert.equal(posts, 1);
    assert.equal(confirms, 0);
    assert.equal(mounted.value().chat.input, user.content);
    assert.equal(mounted.value().chat.needsHistory, false);
    await flush(async () => assert.equal(await mounted.value().chat.send(user.content), "completed"));
    assert.equal(posts, 2);
    assert.equal(confirms, 1);
    assert.equal(mounted.value().chat.input, "");
  } finally { await mounted.unmount(); }
});

test("收到 user 后业务错误不是 success，不恢复已送达原文、不盲重发，新草稿不丢", async () => {
  let posts = 0, confirms = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: identity, stream: async (_path, _body, events) => {
      posts++;
      events({ type: "user", message: user });
      events({ type: "error", error: "业务失败" });
    },
  }, { onUserMessageConfirmed: () => { confirms++; } });
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([user]);
  try {
    assert.equal(confirms, 1);
    assert.equal(mounted.value().chat.input, "");
    assert.equal(mounted.value().chat.needsHistory, true);
    assert.match(mounted.value().chat.error, /业务失败/);
    await flush(async () => assert.equal(await mounted.value().chat.send(user.content), "blocked"));
    await flush(() => mounted.value().chat.setInput("后续草稿"));
    await flush(() => { mounted.value().chat.markHistoryReload(); mounted.value().history.retry(); });
    assert.equal(mounted.value().chat.input, "后续草稿");
    assert.equal(mounted.value().chat.needsHistory, false);
    assert.equal(posts, 1);
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});

test("user 确认丢失时保留原文，重新加载历史只核对，不自动重发", async () => {
  let posts = 0, confirms = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: identity, stream: async () => { posts++; throw new Error("网络中断"); },
  }, { onUserMessageConfirmed: () => { confirms++; } });
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([user]);
  try {
    assert.equal(mounted.value().chat.input, user.content);
    assert.equal(mounted.value().chat.needsHistory, true);
    await flush(() => { mounted.value().chat.markHistoryReload(); mounted.value().history.retry(); });
    assert.equal(posts, 1);
    assert.equal(confirms, 1);
    assert.equal(mounted.value().chat.input, "");
    assert.equal(mounted.value().chat.needsHistory, false);
    await flush(() => { mounted.value().chat.markHistoryReload(); mounted.value().history.retry(); });
    assert.equal(confirms, 1);
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});

test("未知送达且历史暂未落库时保持阻止重发，迟到记录确认后才解锁", async () => {
  let posts = 0, confirms = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: identity, stream: async () => { posts++; throw new Error("连接超时"); },
  }, { onUserMessageConfirmed: () => { confirms++; } });
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    await flush(() => { mounted.value().chat.markHistoryReload(); mounted.value().history.retry(); });
    assert.equal(mounted.value().chat.needsHistory, true);
    assert.equal(mounted.value().chat.input, user.content);
    assert.match(mounted.value().chat.error, /暂未确认/);
    await flush(async () => assert.equal(await mounted.value().chat.send(user.content), "blocked"));
    assert.equal(posts, 1);
    assert.equal(confirms, 0);
    globalThis.fetch = async () => Response.json([user]);
    await flush(() => { mounted.value().chat.markHistoryReload(); mounted.value().history.retry(); });
    assert.equal(mounted.value().chat.needsHistory, false);
    assert.equal(mounted.value().chat.input, "");
    assert.equal(confirms, 1);
    assert.equal(posts, 1);
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});

test("卸载后异步快照完成不能 POST，取消信号确定可用", async () => {
  const snapshot = deferred<string>();
  let posts = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: () => snapshot.promise, stream: async () => { posts++; },
  });
  await mounted.unmount();
  await flush(() => snapshot.resolve(user.content));
  assert.equal(posts, 0);
});

test("切店后迟到 SSE 与 finally 不污染新店、不回调旧店", async () => {
  const response = deferred<void>();
  let emit: (event: ChatStreamEvent) => void = () => undefined;
  let signal: AbortSignal | undefined;
  let confirms = 0, finishes = 0;
  const mounted = await mountChat({ ...fresh, autoSendMessage: user.content }, {
    buildContent: identity, stream: async (_path, _body, events, requestSignal) => {
      emit = events; signal = requestSignal; await response.promise;
    },
  }, { onUserMessageConfirmed: () => { confirms++; }, onTurnComplete: () => { finishes++; } });
  await mounted.update({ ...fresh, shopId: "shop-b" });
  try {
    assert.equal(signal?.aborted, true);
    await flush(() => { emit({ type: "user", message: user }); response.resolve(); });
    assert.equal(mounted.value().history.messages?.length ?? 0, 0);
    assert.equal(confirms, 0);
    assert.equal(finishes, 0);
  } finally { await mounted.unmount(); }
});
