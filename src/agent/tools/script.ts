// 用途：视频脚本生成工具（PRD 故事 25-27）：把类型/时长/语言/风格与可选商品名转交给脚本生成编排（agent/video-script-flow），再把结构化结果格式化为工具返回；参数 schema 用 TypeBox（pi-agent-core 的 AgentTool.parameters 契约要求 TSchema）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { runVideoScriptGeneration } from "@/agent/video-script-flow";
import { marketLanguageHint } from "@/lib/markets";
import type { GenerateTextFn, ScriptToolDetails } from "@/types";

const scriptParamsSchema = Type.Object({
  productName: Type.Optional(
    Type.String({ description: "商品名称，必须使用卖家消息中的商品名称原文，不要翻译或改写；卖家未指定商品时可省略", minLength: 1, maxLength: 200 }),
  ),
  type: Type.Union([Type.Literal("开箱"), Type.Literal("教程"), Type.Literal("种草"), Type.Literal("对比")], {
    description: "脚本类型：开箱 / 教程 / 种草 / 对比",
  }),
  duration: Type.Number({ description: "视频总时长（秒），卖家未说明时默认 30", minimum: 5, maximum: 600 }),
  language: Type.String({
    description: "口播与字幕的目标语言代码：" + marketLanguageHint(),
    minLength: 2,
    maxLength: 8,
    pattern: "^[a-z]{2}(-[A-Z]{2})?$",
  }),
  style: Type.Optional(Type.String({ description: "要模仿的视频风格描述（结构与节奏），可选", maxLength: 200 })),
});

type ScriptParams = Static<typeof scriptParamsSchema>;

export function createVideoScriptTool(deps: {
  shopId: string;
  generateText: GenerateTextFn;
}): AgentTool<typeof scriptParamsSchema, ScriptToolDetails> {
  return {
    name: "generate_video_script",
    label: "生成视频脚本",
    description:
      "为商品生成 TikTok 带货短视频分镜脚本（前 3 秒钩子、逐镜头画面/口播/字幕/秒数、结尾行动号召）并保存到「脚本」页面。卖家要求写视频脚本、分镜脚本、拍摄脚本时必须调用本工具；productName 用卖家消息中的商品名称原文（未指定商品可省略）；type 按卖家要求（开箱/教程/种草/对比）；duration 秒数按卖家要求；style 填卖家描述的模仿风格。",
    parameters: scriptParamsSchema,
    async execute(_toolCallId, params: ScriptParams, signal?: AbortSignal): Promise<AgentToolResult<ScriptToolDetails>> {
      const details = await runVideoScriptGeneration({
        productName: params.productName,
        type: params.type,
        duration: params.duration,
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
            text: `已生成 ${details.type}类 ${details.duration} 秒视频脚本（${details.shotCount} 个分镜，钩子：${details.hook}），已保存到「脚本」页面。`,
          },
        ],
        details,
      };
    },
  };
}
