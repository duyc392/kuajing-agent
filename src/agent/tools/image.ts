// 用途：生图工具（PRD 故事 22-24）：主图/详情图序列/变体，数据链路——对话请求 → 文本模型组合绘图提示词 →
// 调 gpt-image-2 → 图片文件写入 public/generated/ → 数据库写 ProductImage 草稿记录，应用动作在商品详情页完成。
// 参数 schema 用 TypeBox（pi-agent-core 的 AgentTool.parameters 契约要求 TSchema）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { runImageVariantGeneration, runProductImageGeneration } from "@/agent/image-flow";
import type { GenerateTextFn, ImageToolDetails } from "@/types";

interface ImageToolDeps {
  shopId: string;
  generateText: GenerateTextFn;
}

const generationSchema = Type.Object({
  productName: Type.String({ description: "商品名称，必须使用卖家消息中的商品名称原文，不要翻译或改写", minLength: 1, maxLength: 200, pattern: "\\S" }),
  type: Type.Union([Type.Literal("main"), Type.Literal("detail")], {
    description: "图片用途：main=商品主图（1 张）；detail=详情图序列（多张，覆盖卖点/场景/参数）",
  }),
  count: Type.Optional(
    Type.Integer({ description: "详情图数量（2-3 张）；type 为 main 时忽略此参数", minimum: 2, maximum: 3 }),
  ),
});

const variantSchema = Type.Object({
  productName: Type.String({ description: "商品名称，必须使用卖家消息中的商品名称原文，不要翻译或改写", minLength: 1, maxLength: 200, pattern: "\\S" }),
  instruction: Type.String({ description: "变体要求：新背景或使用场景描述（保持商品主体不变）", minLength: 1, maxLength: 500, pattern: "\\S" }),
});

type GenerationParams = Static<typeof generationSchema>;
type VariantParams = Static<typeof variantSchema>;

export function createProductImageTool(deps: ImageToolDeps): AgentTool<typeof generationSchema, ImageToolDetails> {
  return {
    name: "generate_product_image",
    label: "生成商品图片",
    description:
      "为指定商品生成商品主图或详情图序列（gpt-image-2），图片自动按目标市场审美生成，保存为草稿供卖家在商品详情页「图片」标签应用。卖家要求生成商品图、主图、详情图、产品图时必须调用本工具；productName 用卖家消息中的商品名称原文；type 按卖家要求选择 main 或 detail；detail 的 count 按卖家要求（未说明默认 3）。",
    parameters: generationSchema,
    async execute(_toolCallId, params: GenerationParams, signal?: AbortSignal): Promise<AgentToolResult<ImageToolDetails>> {
      const details = await runProductImageGeneration({
        productName: params.productName,
        type: params.type,
        count: params.count ?? 2,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      const incompleteNote = (details.incomplete ?? 0) > 0 ? `（另有 ${details.incomplete} 张因时间预算未完成，可再次要求继续生成）` : "";
      return {
        content: [{
          type: "text",
          text: `已为「${details.productName}」生成 ${details.imageCount} 张${details.type === "main" ? "主图" : "详情图（含卖点与场景展示）"}${incompleteNote}，可在商品详情页「图片」标签查看并应用。`,
        }],
        details,
      };
    },
  };
}

export function createImageVariantTool(deps: ImageToolDeps): AgentTool<typeof variantSchema, ImageToolDetails> {
  return {
    name: "generate_image_variant",
    label: "生成图片变体",
    description:
      "基于商品已有图片（默认取已应用的主图）生成不同背景或使用场景的变体，商品主体保持不变。卖家要求换背景、换场景、生成图片变体时必须调用本工具；productName 用卖家消息中的商品名称原文；instruction 填卖家描述的新背景或场景。",
    parameters: variantSchema,
    async execute(_toolCallId, params: VariantParams, signal?: AbortSignal): Promise<AgentToolResult<ImageToolDetails>> {
      const details = await runImageVariantGeneration({
        productName: params.productName,
        instruction: params.instruction,
        shopId: deps.shopId,
        generateText: deps.generateText,
        signal,
      });
      return {
        content: [{ type: "text", text: `已为「${details.productName}」生成 ${details.imageCount} 张图片变体，可在商品详情页「图片」标签查看并应用。` }],
        details,
      };
    },
  };
}
