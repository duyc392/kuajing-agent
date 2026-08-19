// 用途：文案生成工具：把卖家原话中的商品名与语言转交给文案生成编排（agent/copywriting-flow），再把结构化结果格式化为工具返回；参数 schema 用 TypeBox（pi-agent-core 的 AgentTool.parameters 契约要求 TSchema）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { runCopyGeneration } from "@/agent/copywriting-flow";
import type { CopyToolDetails, GenerateTextFn } from "@/types";

const copyParamsSchema = Type.Object({
  productName: Type.String({
    description: "商品名称，必须使用卖家消息中的商品名称原文，不要翻译或改写",
    minLength: 1,
    maxLength: 200,
  }),
  language: Type.String({
    description: "目标语言代码：美国市场用 en，印尼 id，泰国 th，越南 vi，中文市场 zh",
    minLength: 2,
    maxLength: 8,
    pattern: "^[a-z]{2}(-[A-Z]{2})?$",
  }),
  feedback: Type.Optional(
    Type.String({ description: "卖家对上一版文案的修改意见，可选；有修改意见时基于它生成新版本", maxLength: 2000 }),
  ),
});

type CopyParams = Static<typeof copyParamsSchema>;

export interface CopywritingToolDeps {
  shopId: string;
  generateText: GenerateTextFn;
}

export function createCopywritingTool(deps: CopywritingToolDeps): AgentTool<typeof copyParamsSchema, CopyToolDetails> {
  return {
    name: "generate_product_copy",
    label: "生成商品文案",
    description:
      "为指定商品生成完整上架文案（标题、描述、卖点、利益点）并保存为新版本。卖家要求生成或修改商品文案时必须调用本工具；productName 用卖家消息中的商品名称原文；language 按店铺市场选择（美国 en、印尼 id、泰国 th、越南 vi、中文 zh）；卖家提出修改意见时把意见放进 feedback 参数生成新版本。",
    parameters: copyParamsSchema,
    async execute(_toolCallId, params: CopyParams, signal?: AbortSignal): Promise<AgentToolResult<CopyToolDetails>> {
      const details = await runCopyGeneration({
        productName: params.productName,
        language: params.language,
        feedback: params.feedback,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      return {
        content: [
          {
            type: "text",
            text: `已生成 ${details.language} 文案第 ${details.version} 版（标题：${details.title}），可在商品详情页「文案历史」查看。`,
          },
        ],
        details,
      };
    },
  };
}
