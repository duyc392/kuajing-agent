// 用途：工具注册表结构守护：数量、名称唯一、描述完整、参数 schema 不接受 shopId、execute 均为函数。
import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentTools } from "@/agent/tools";

test("工具注册表：结构完整且不接收模型传入的 shopId", () => {
  const tools = buildAgentTools({ shopId: "shop-test" });
  assert.equal(tools.length, 31);

  const names = tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, "工具名称必须唯一");
  for (const tool of tools) {
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/, `${tool.name} 不是 snake_case`);
    assert.ok(tool.label.trim() !== "", `${tool.name} 缺少 label`);
    assert.ok(tool.description.trim().length > 20, `${tool.name} 描述过短`);
    assert.equal(typeof tool.execute, "function", `${tool.name} 缺少 execute`);
    const schema = tool.parameters as { properties?: Record<string, unknown> };
    assert.equal(Object.hasOwn(schema.properties ?? {}, "shopId"), false, `${tool.name} 不应接受 shopId`);
  }
});

test("工具注册表：每次构建返回独立实例", () => {
  const first = buildAgentTools({ shopId: "shop-a" });
  const second = buildAgentTools({ shopId: "shop-b" });
  assert.notEqual(first[0], second[0]);
  assert.equal(first[0].name, second[0].name);
});
