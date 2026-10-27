import test from "node:test";
import assert from "node:assert/strict";
import { useConversationList } from "./use-conversation-list";
import { useDrawerConversation } from "./use-drawer-conversation";
import { deferred, flush, mountHook } from "./chat-test-utils";
import type { ConversationInitialization } from "@/types";

test("列表新建包括空新建都带 []，autoSend 独立传递，连点只创建一次", async () => {
  const original = globalThis.fetch;
  let creates = 0;
  const selected: { id: string; initialization?: ConversationInitialization }[] = [];
  globalThis.fetch = async (_path, init) => {
    if (init?.method === "POST") { creates++; return Response.json({ id: `new-${creates}`, title: "新对话", updatedAt: "" }); }
    return Response.json([]);
  };
  const mounted = await mountHook((props: { shopId: string }) => useConversationList(props.shopId,
    (id, initialization) => selected.push({ id, initialization })), { shopId: "shop-a" });
  try {
    await flush(async () => { await Promise.all([mounted.value().handleCreate(), mounted.value().handleCreate()]); });
    assert.equal(creates, 1);
    assert.deepEqual(selected[0].initialization, { initialMessages: [], autoSendMessage: undefined });
    await flush(() => mounted.value().handleCreate("首条原文"));
    assert.deepEqual(selected[1].initialization, { initialMessages: [], autoSendMessage: "首条原文" });
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});

test("列表创建后切店，迟到结果不选择到新店", async () => {
  const original = globalThis.fetch;
  const created = deferred<Response>();
  let selected = 0;
  globalThis.fetch = async (_path, init) => init?.method === "POST" ? created.promise : Response.json([]);
  const mounted = await mountHook((props: { shopId: string }) => useConversationList(props.shopId, () => { selected++; }), { shopId: "a" });
  let request: Promise<void> | undefined;
  try {
    await flush(() => { request = mounted.value().handleCreate("原文"); });
    await mounted.update({ shopId: "b" });
    await flush(async () => { created.resolve(Response.json({ id: "late" })); await request; });
    assert.equal(selected, 0);
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});

test("抽屉旧会话默认无种子；新建种子与 pending 独立，只有确认才清理", async () => {
  const original = globalThis.fetch;
  let list: { id: string }[] = [];
  globalThis.fetch = async (_path, init) => init?.method === "POST" ? Response.json({ id: "new" }) : Response.json(list);
  const mounted = await mountHook((props: { shopId: string }) => useDrawerConversation(true, props.shopId), { shopId: "a" });
  try {
    assert.equal(mounted.value().resolved, true);
    assert.equal(mounted.value().selection, null);
    await flush(() => mounted.value().startConversation("首条"));
    assert.deepEqual(mounted.value().selection?.initialMessages, []);
    assert.equal(mounted.value().selection?.autoSendMessage, "首条");
    await flush(() => mounted.value().confirmFirstMessage());
    assert.equal(mounted.value().selection?.autoSendMessage, undefined);
    list = [{ id: "existing" }];
    await mounted.update({ shopId: "b" });
    assert.equal(mounted.value().selection?.id, "existing");
    assert.equal(mounted.value().selection?.initialMessages, undefined);
    await mounted.update({ shopId: "a" });
    assert.equal(mounted.value().selection?.id, "existing");
    assert.equal(mounted.value().selection?.initialMessages, undefined);
  } finally { await mounted.unmount(); globalThis.fetch = original; }
});
