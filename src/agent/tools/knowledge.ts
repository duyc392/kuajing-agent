// 用途：店铺知识库检索工具：按需取回店铺画像、长期记忆、商品 DNA、历史脚本与本地领域知识片段。
// 只做检索与返回，不做总结；总结由主 Agent 在回答里完成。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { searchShopKnowledge } from "@/services/shop-knowledge.service";
import { SHOP_KNOWLEDGE_SCOPES, type ShopKnowledgeDetails } from "@/types";

const knowledgeSchema = Type.Object({
  query: Type.String({ description: "要检索的内容，用自然语言，如「这个牌子主打什么调性」", minLength: 1, maxLength: 300, pattern: "\\S" }),
  scope: Type.Union(
    SHOP_KNOWLEDGE_SCOPES.map((scope) => Type.Literal(scope)),
    { description: "检索范围：brand 品牌与店铺画像 / audience 长期记忆与受众 / products 商品 DNA / scripts 历史脚本 / all 全部" },
  ),
  limit: Type.Optional(Type.Integer({ description: "返回条数，默认 6，上限 20", minimum: 1, maximum: 20 })),
});

type KnowledgeParams = Static<typeof knowledgeSchema>;

export function createShopKnowledgeTool(deps: { shopId: string }): AgentTool<typeof knowledgeSchema, ShopKnowledgeDetails> {
  return {
    name: "query_shop_knowledge_base",
    label: "检索店铺知识库",
    description:
      "检索当前店铺的品牌调性、受众设定、商品卖点与历史爆款脚本，以及本地平台规则/物流/关税知识。写文案、编分镜、给建议前不确定店铺背景时先查，避免写出和店铺定位不符的内容。返回片段都带来源，引用时要说明来源。",
    parameters: knowledgeSchema,
    async execute(_toolCallId, params: KnowledgeParams): Promise<AgentToolResult<ShopKnowledgeDetails>> {
      const details = await searchShopKnowledge({
        shopId: deps.shopId,
        query: params.query.trim(),
        scope: params.scope,
        limit: params.limit,
      });
      const text = details.snippets.length === 0
        ? "知识库里没有检索到相关内容，请如实说明没有找到依据，不要凭空编造店铺设定。"
        : [
            `检索到 ${details.snippets.length} 条相关内容（来源：${details.snippets.map((item) => item.source).join("、")}）：`,
            ...details.snippets.map((item, index) => `${index + 1}. [${item.source}] ${item.title}\n${item.content.slice(0, 600)}`),
          ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}
