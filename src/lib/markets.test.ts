// 用途：市场配置单测：下拉列表来源、白名单校验、FastMoss 地域映射与语言提示文案。
import test from "node:test";
import assert from "node:assert/strict";
import { getMarkets, isKnownMarket, marketLanguageHint, marketToRegion } from "@/lib/markets";

test("市场列表包含全部配置项且 value 不重复", () => {
  const markets = getMarkets();
  assert.equal(markets.length, 16);
  assert.equal(new Set(markets.map((market) => market.value)).size, markets.length);
  assert.ok(markets.some((market) => market.value === "美国"));
});

test("白名单只接受列表内市场", () => {
  assert.equal(isKnownMarket("美国"), true);
  assert.equal(isKnownMarket("东南亚-印尼"), true);
  assert.equal(isKnownMarket("火星"), false);
});

test("FastMoss 地域代码映射", () => {
  assert.equal(marketToRegion("美国"), "US");
  assert.equal(marketToRegion("东南亚-印尼"), "ID");
  assert.equal(marketToRegion("火星"), null);
});

test("语言提示包含市场简称与语言代码", () => {
  const hint = marketLanguageHint();
  assert.match(hint, /美国用 en/);
  assert.match(hint, /印尼用 id/);
  assert.match(hint, /中文市场用 zh/);
});
