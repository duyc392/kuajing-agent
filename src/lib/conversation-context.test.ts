// 用途：预算包含所有输入，近期按完整轮次保留，不剪原文。
import test from "node:test";
import assert from "node:assert/strict";
import { createContextBudget, estimateContextTokens, historyTokenEstimate, planContextHistory } from "./conversation-context";
import type { ContextMessage } from "@/types/context";

const settings = { fallbackCapacity: 12000, fallbackMaxTokens: 512, outputTokens: 512,
  safetyTokens: 128, toolReserveTokens: 256, summaryTokens: 512, estimateMargin: 1.25 };

function message(id: number, role: "user" | "agent", content: string): ContextMessage {
  return { id: String(id), role, content, createdAt: new Date(id) };
}

test("保守近似区分ASCII和UTF8，system/tools/current/知识均计入预算，真实maxTokens约束输出", () => {
  assert.ok(estimateContextTokens("中文") > estimateContextTokens("ab"));
  const base = { model: { contextWindow: 12000, maxTokens: 200 }, systemPrompt: "", tools: [], content: "", settings };
  const empty = createContextBudget(base);
  const full = createContextBudget({ ...base, systemPrompt: "system".repeat(30), content: "本轮".repeat(30),
    tools: [{ name: "t".repeat(30), description: "d".repeat(30), parameters: { input: "p".repeat(30) } }],
    postHistoryContext: "knowledge".repeat(30) });
  assert.equal(full.outputReserve, 200);
  assert.ok(full.fixedTokens > empty.fixedTokens + 800);
  assert.equal(full.historyTokens, full.inputLimit - full.fixedTokens);
});

test("超过2000字符的近期用户尾部完整，超过20条不硬丢，压缩不拆完整轮次", () => {
  const rows = Array.from({ length: 30 }, (_, i) => message(i, i % 2 ? "agent" : "user", `原文${i}`));
  const long = message(30, "user", "x".repeat(4000) + "用户尾部禁止项");
  rows.push(long, message(31, "agent", "回答"));
  assert.equal(planContextHistory(rows, historyTokenEstimate(rows)).retained.length, 32);
  const lastTurnTokens = historyTokenEstimate(rows.slice(-2));
  const plan = planContextHistory(rows, lastTurnTokens + 20);
  assert.deepEqual(plan.retained, rows.slice(-2));
  assert.equal(plan.retained[0].content, long.content);
  assert.equal(plan.compact.length, 30);
  assert.equal(plan.fits, true);
  assert.equal(planContextHistory(rows, lastTurnTokens - 1).fits, false);
});
