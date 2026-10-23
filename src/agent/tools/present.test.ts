// 用途：报告卡工具单测：三类报告投影、缺字段直接报错、详情结构来自校验函数。
import test from "node:test";
import assert from "node:assert/strict";
import { createPresentReportTool } from "@/agent/tools/present";
import { firstText } from "@/agent/tools/tool-test-utils";
import { ValidationError } from "@/lib/errors";

test("present_report：市场/推荐/竞品三类卡片", async () => {
  const tool = createPresentReportTool();

  const market = await tool.execute("call-1", {
    kind: "market",
    data: { market: "美国", category: "美妆", capacity: "100 亿", competition: "中等", growth: "12%", profit: "40%", dataHighlights: ["a"] },
  });
  assert.equal(market.details.kind, "market");
  assert.match(firstText(market.content), /市场分析报告卡/);

  const recommendation = await tool.execute("call-2", {
    kind: "recommendation",
    data: { market: "美国", recommendations: [{ direction: "方向", dataSupport: "数据", reason: "理由" }] },
  });
  assert.equal(recommendation.details.kind, "recommendation");

  const competitor = await tool.execute("call-3", {
    kind: "competitor",
    data: {
      shopName: "竞品店",
      pricing: "低价",
      contentStyle: "口播",
      listingFrequency: "每天",
      trafficStructure: "短视频",
      comparison: "对比",
      differentiation: "差异",
    },
  });
  assert.equal(competitor.details.kind, "competitor");
});

test("present_report：字段缺失抛 ValidationError", async () => {
  const tool = createPresentReportTool();
  await assert.rejects(
    tool.execute("call-1", { kind: "market", data: { market: "美国" } }),
    ValidationError,
  );
});
