// 用途：报告卡校验单测：必填字段、长度收敛、高亮项过滤、推荐方向数量与结构错误。
import test from "node:test";
import assert from "node:assert/strict";
import { ValidationError } from "@/lib/errors";
import { validateReportPresentation } from "@/lib/report-validation";

test("market 卡：字段齐全、过滤非字符串高亮、超过 6 条截断", () => {
  const card = validateReportPresentation("market", {
    market: "美国",
    category: "美妆",
    capacity: "100 亿美元",
    competition: "中等",
    growth: "12%",
    profit: "毛利 40%",
    dataHighlights: ["a", 1, "", "b", "c", "d", "e", "f", "g"],
  });
  assert.equal(card.kind, "market");
  assert.deepEqual(card.data.dataHighlights, ["a", "b", "c", "d", "e", "f"]);
});

test("market 卡：过长字段按上限截断", () => {
  const card = validateReportPresentation("market", {
    market: "美".repeat(80),
    category: "类目",
    capacity: "容量",
    competition: "竞争",
    growth: "增长",
    profit: "利润",
  });
  if (card.kind !== "market") throw new Error("期望市场卡");
  assert.equal(card.data.market.length, 50);
});

test("recommendation 卡：最多保留 3 个方向", () => {
  const card = validateReportPresentation("recommendation", {
    market: "美国",
    recommendations: [1, 2, 3, 4].map((index) => ({ direction: `方向${index}`, dataSupport: "数据", reason: "理由" })),
  });
  if (card.kind !== "recommendation") throw new Error("期望推荐卡");
  assert.equal(card.data.recommendations.length, 3);
  assert.equal(card.data.recommendations[0].direction, "方向1");
});

test("recommendation 卡：没有完整方向时抛 ValidationError", () => {
  assert.throws(() => validateReportPresentation("recommendation", { market: "美国", recommendations: [] }), ValidationError);
  assert.throws(
    () => validateReportPresentation("recommendation", { market: "美国", recommendations: [{ direction: "方向" }] }),
    ValidationError,
  );
});

test("competitor 卡：缺字段抛 ValidationError", () => {
  assert.throws(
    () => validateReportPresentation("competitor", { shopName: "竞品店" }),
    ValidationError,
  );
});

test("必填字段为空白时抛 ValidationError", () => {
  assert.throws(
    () => validateReportPresentation("market", { market: "   ", category: "类目", capacity: "容量", competition: "竞争", growth: "增长", profit: "利润" }),
    ValidationError,
  );
});
