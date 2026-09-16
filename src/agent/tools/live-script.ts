// 用途：直播脚本生成工具（PRD 故事 28）：把时长/商品列表/语言/风格转交给直播脚本生成编排（agent/live-script-flow），
// 再把结构化结果格式化为工具返回；参数 schema 用 TypeBox（pi-agent-core 的 AgentTool.parameters 契约要求 TSchema）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { runLiveScriptGeneration } from "@/agent/live-script-flow";
import { marketLanguageHint } from "@/lib/markets";
import type { GenerateTextFn, LiveScriptToolDetails } from "@/types";

const liveScriptParamsSchema = Type.Object({
  productNames: Type.Optional(
    Type.Array(
      Type.String({ description: "商品名称，必须使用卖家消息中的商品名称原文，不要翻译或改写", minLength: 1, maxLength: 200 }),
      { description: "本场直播要讲解的商品名称列表；卖家未指定商品时省略，使用店铺全部商品", maxItems: 20 },
    ),
  ),
  durationMinutes: Type.Number({ description: "直播总时长（分钟），卖家未说明时默认 60", minimum: 15, maximum: 600 }),
  language: Type.String({
    description: "关键话术的目标语言代码：" + marketLanguageHint(),
    minLength: 2,
    maxLength: 8,
    pattern: "^[a-z]{2}(-[A-Z]{2})?$",
  }),
  style: Type.Optional(Type.String({ description: "要模仿的直播风格描述（节奏与话术风格），可选", maxLength: 200 })),
});

type LiveScriptParams = Static<typeof liveScriptParamsSchema>;

export function createLiveScriptTool(deps: {
  shopId: string;
  generateText: GenerateTextFn;
}): AgentTool<typeof liveScriptParamsSchema, LiveScriptToolDetails> {
  return {
    name: "generate_live_script",
    label: "生成直播脚本",
    description:
      "为卖家生成 TikTok 带货直播流程脚本（开场、商品讲解顺序、互动、促销节奏，含各阶段分钟数与关键话术）并保存到「脚本」页面。卖家要求写直播脚本、直播流程、直播话术时必须调用本工具；productNames 用卖家消息中的商品名称原文列表（未指定商品可省略，使用店铺全部商品）；durationMinutes 按卖家要求（未说明默认 60）；language 按店铺市场选择；style 填卖家描述的模仿风格。",
    parameters: liveScriptParamsSchema,
    async execute(_toolCallId, params: LiveScriptParams, signal?: AbortSignal): Promise<AgentToolResult<LiveScriptToolDetails>> {
      const details = await runLiveScriptGeneration({
        productNames: params.productNames,
        durationMinutes: params.durationMinutes,
        language: params.language,
        style: params.style,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      return {
        content: [
          {
            type: "text",
            text: `已生成 ${details.durationMinutes} 分钟直播流程脚本（${details.segmentCount} 个阶段、${details.productCount} 个商品），已保存到「脚本」页面。`,
          },
        ],
        details,
      };
    },
  };
}
