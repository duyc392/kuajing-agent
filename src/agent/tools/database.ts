// 用途：数据库查询工具（PRD 故事 44「查历史业务数据」）：让 Agent 查询当前店铺的历史业务数据（商品、视频脚本、直播脚本、对话记录）并据实回答，而不是凭空编造。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { listProducts } from "@/services/products.service";
import { listScripts } from "@/services/video-scripts.service";
import { listLiveScripts } from "@/services/live-scripts.service";
import { listConversations } from "@/services/conversations.service";

const queryShopDataSchema = Type.Object({
  resource: Type.Union(
    [Type.Literal("products"), Type.Literal("videoScripts"), Type.Literal("liveScripts"), Type.Literal("conversations")],
    { description: "要查询的资源：products（商品）/ videoScripts（视频脚本）/ liveScripts（直播脚本）/ conversations（对话记录）" },
  ),
  since: Type.Optional(Type.String({ description: "只返回该日期（含）之后的记录，ISO 日期格式如 2024-01-01；不填返回全部" })),
  limit: Type.Optional(Type.Number({ description: "最多返回条数，默认 20，上限 50" })),
});

type QueryShopDataParams = Static<typeof queryShopDataSchema>;

// 按「年-月-日」比较两个 ISO 日期字符串；ISO 格式下字典序等于时间先后顺序。
function withinSince(dateIso: string, since?: string): boolean {
  if (since === undefined) return true;
  return dateIso.slice(0, 10) >= since.slice(0, 10);
}

// 截断过长的钩子文案，避免一条脚本把工具返回撑得过大。
function shortHook(hook: string): string {
  return hook.length > 40 ? `${hook.slice(0, 40)}…` : hook;
}

export function createDatabaseTool(deps: { shopId: string }): AgentTool<typeof queryShopDataSchema, { resource: string; count: number }> {
  return {
    name: "query_shop_data",
    label: "查询店铺数据",
    description:
      "查询当前店铺的历史业务数据，用于回答卖家关于历史记录的问题（如「上季度新上了几个品」「上个月写了哪些脚本」）。resource 选择要查的资源；since 传 ISO 日期（如 2024-01-01）只返回该日期之后的记录，不填返回全部；limit 控制返回条数（默认 20）。每条结果都带日期，按日期据实回答。",
    parameters: queryShopDataSchema,
    async execute(_toolCallId, params: QueryShopDataParams, _signal?: AbortSignal): Promise<AgentToolResult<{ resource: string; count: number }>> {
      const limit = Math.min(Math.max(Math.floor(params.limit ?? 20), 1), 50);
      const items: { text: string; dateIso: string }[] = [];
      if (params.resource === "products") {
        for (const product of await listProducts(deps.shopId)) {
          items.push({ text: `- ${product.name}（分类：${product.category ?? "未分类"}，创建于 ${product.createdAt.slice(0, 10)}）`, dateIso: product.createdAt });
        }
      } else if (params.resource === "videoScripts") {
        for (const script of await listScripts(deps.shopId)) {
          items.push({ text: `- 视频脚本·${script.type}（${script.duration} 秒，钩子：${shortHook(script.hook)}，更新于 ${script.updatedAt.slice(0, 10)}）`, dateIso: script.updatedAt });
        }
      } else if (params.resource === "liveScripts") {
        for (const script of await listLiveScripts(deps.shopId)) {
          items.push({ text: `- 直播脚本（${script.duration} 秒 · ${script.segmentCount} 个阶段，更新于 ${script.updatedAt.slice(0, 10)}）`, dateIso: script.updatedAt });
        }
      } else {
        for (const conversation of await listConversations(deps.shopId)) {
          items.push({ text: `- 对话「${conversation.title}」（更新于 ${conversation.updatedAt.slice(0, 10)}）`, dateIso: conversation.updatedAt });
        }
      }
      const matched = items.filter((item) => withinSince(item.dateIso, params.since));
      const shown = matched.slice(0, limit);
      const head = `查询结果（${params.resource}）：共 ${matched.length} 条${params.since ? `，自 ${params.since} 起` : ""}${matched.length > limit ? `，以下为前 ${limit} 条` : ""}。`;
      const text = shown.length > 0 ? [head, ...shown.map((item) => item.text)].join("\n") : `${head}\n（没有匹配记录）`;
      return {
        content: [{ type: "text", text }],
        details: { resource: params.resource, count: matched.length },
      };
    },
  };
}
