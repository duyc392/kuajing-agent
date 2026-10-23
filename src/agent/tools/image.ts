// 用途：图片生产工具：自由出图、固定工作流出图、图片建档各一个工具。
// 三者共用同一个生图模型与接口；区别只在提示词来源（Agent 自由写 / 固定模板）与是否写档案。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { renderImages } from "@/services/image-render.service";
import { runImageWorkflow } from "@/services/image-workflow.service";
import { saveGeneratedImageRecords } from "@/services/product-image-record.service";
import { IMAGE_WORKFLOW_TEMPLATES, WORKFLOW_MAX_IMAGES } from "@/lib/image-workflows";
import {
  IMAGE_RECORD_TOOL_NAME,
  IMAGE_TOOL_NAME,
  IMAGE_WORKFLOW_TOOL_NAME,
  type ImageWorkflowDetails,
  type ProductImageType,
  type RenderImageDetails,
  type SavedImageRecordDetails,
} from "@/types";

const typeSchema = Type.Union([Type.Literal("main"), Type.Literal("detail"), Type.Literal("variant")]);

const renderSchema = Type.Object({
  productName: Type.String({ description: "商品名称，用卖家消息里的原文", minLength: 1, maxLength: 200, pattern: "\\S" }),
  type: typeSchema,
  prompt: Type.String({
    description: "英文出图提示词：主体 → 场景 → 光线 → 机位构图 → 风格 → 画质；只允许英文与半角符号",
    minLength: 10,
    maxLength: 2000,
    pattern: "\\S",
  }),
  count: Type.Optional(Type.Integer({ description: "生成张数，默认 1，上限 4", minimum: 1, maximum: 4 })),
  referencePath: Type.Optional(
    Type.String({ description: "可选：参考图在站内的路径（如 /generated/xxx.png），用于生成变体", maxLength: 500 }),
  ),
});

const workflowSchema = Type.Object({
  workflow: Type.Union(
    [Type.Literal("text-to-image"), Type.Literal("background-replace"), Type.Literal("model-swap"), Type.Literal("storyboard")],
    {
      description:
        "固定工作流：text-to-image 纯文生图 / background-replace 白底图换背景 / model-swap 模特换装 / storyboard 分镜草图。提示词模板已内置，保证同款商品多次出图风格一致",
    },
  ),
  subject: Type.String({
    description: "商品主体英文描述，如 matte black stainless steel water bottle with a bamboo lid；只写英文",
    minLength: 5,
    maxLength: 500,
    pattern: "\\S",
  }),
  scene: Type.String({
    description: "场景英文描述，如 sunlit kitchen counter with a linen cloth；只写英文",
    minLength: 3,
    maxLength: 500,
    pattern: "\\S",
  }),
  count: Type.Optional(Type.Integer({ description: `生成张数，默认 1，上限 ${WORKFLOW_MAX_IMAGES}`, minimum: 1, maximum: WORKFLOW_MAX_IMAGES })),
  referencePath: Type.Optional(
    Type.String({ description: "商品原图站内路径（如 /generated/xxx.png）；换背景与换装必填其一", maxLength: 500 }),
  ),
  referenceUrl: Type.Optional(
    Type.String({ description: "商品原图 https 链接；换背景与换装必填其一", maxLength: 1000 }),
  ),
});

type WorkflowParams = Static<typeof workflowSchema>;

const recordSchema = Type.Object({  productName: Type.String({ description: "商品名称，用卖家消息里的原文", minLength: 1, maxLength: 200, pattern: "\\S" }),
  type: typeSchema,
  prompt: Type.String({ description: "生成这些图片时用的英文提示词，便于日后追溯", maxLength: 2000 }),
  paths: Type.Array(Type.String({ description: "图片站内路径，如 /generated/xxx.png", minLength: 1, maxLength: 500 }), {
    description: "要登记的图片路径列表",
    minItems: 1,
    maxItems: 10,
  }),
});

type RenderParams = Static<typeof renderSchema>;
type RecordParams = Static<typeof recordSchema>;

function asType(value: Static<typeof typeSchema>): ProductImageType {
  return value;
}

export function createRenderImageTool(): AgentTool<typeof renderSchema, RenderImageDetails> {
  return {
    name: IMAGE_TOOL_NAME,
    label: "生成商品图片",
    description:
      "按你写好的英文提示词调用图片模型出图（可带参考图做变体），返回图片路径。提示词必须先由你按视觉 SOP 写好再传进来，本工具不做任何文案判断。出图后用 save_product_image_record 建档，卖家才能在产品页应用。",
    parameters: renderSchema,
    async execute(_toolCallId, params: RenderParams, signal?: AbortSignal): Promise<AgentToolResult<RenderImageDetails>> {
      const details = await renderImages({
        productName: params.productName.trim(),
        type: asType(params.type),
        prompt: params.prompt.trim(),
        count: params.count ?? 1,
        referencePublicPath: params.referencePath,
        signal,
      });
      const incompleteNote = details.incomplete > 0 ? `（另有 ${details.incomplete} 张因时间预算未完成，可再次要求继续生成）` : "";
      return {
        content: [{
          type: "text",
          text: `已为「${details.productName}」生成 ${details.imageCount} 张图片${incompleteNote}。路径：${details.paths.join("、")}。需要出现在商品页请再调用 save_product_image_record。`,
        }],
        details,
      };
    },
  };
}

export function createRunImageWorkflowTool(): AgentTool<typeof workflowSchema, ImageWorkflowDetails> {
  return {
    name: IMAGE_WORKFLOW_TOOL_NAME,
    label: "按固定工作流出图",
    description:
      "用内置的固定提示词模板出图（换背景 / 换装 / 分镜草图 / 纯文生图），与 render_product_image 用的是同一个生图模型和接口，区别只是风格模板已固定，同款商品多次出图更统一。你只需提供英文 subject（商品主体）与 scene（场景），不要自己写完整提示词。换背景与换装必须提供商品原图（referencePath 或 referenceUrl），否则商品会变样。",
    parameters: workflowSchema,
    async execute(_toolCallId, params: WorkflowParams, signal?: AbortSignal): Promise<AgentToolResult<ImageWorkflowDetails>> {
      const details = await runImageWorkflow({
        workflow: params.workflow,
        subject: params.subject,
        scene: params.scene,
        count: params.count ?? 1,
        referencePublicPath: params.referencePath,
        referenceUrl: params.referenceUrl,
        signal,
      });
      const template = IMAGE_WORKFLOW_TEMPLATES[params.workflow];
      const incompleteNote = details.incomplete > 0 ? `（另有 ${details.incomplete} 张未完成，可再次要求继续生成）` : "";
      return {
        content: [{
          type: "text",
          text: `已按「${template.label}」工作流生成 ${details.imageCount} 张图片${incompleteNote}。路径：${details.paths.join("、")}。需要作为商品图使用时再调用 save_product_image_record。`,
        }],
        details,
      };
    },
  };
}

export function createSaveImageRecordTool(deps: { shopId: string }): AgentTool<typeof recordSchema, SavedImageRecordDetails> {
  return {
    name: IMAGE_RECORD_TOOL_NAME,
    label: "登记商品图片",
    description:
      "把已生成的图片文件登记到商品图片档案（草稿状态），卖家可在商品详情页「图片」标签查看并应用。必须在图片生成成功后调用，否则图片不会出现在商品页。",
    parameters: recordSchema,
    async execute(_toolCallId, params: RecordParams): Promise<AgentToolResult<SavedImageRecordDetails>> {
      const details = await saveGeneratedImageRecords({
        shopId: deps.shopId,
        productName: params.productName.trim(),
        type: asType(params.type),
        prompt: params.prompt.trim(),
        paths: params.paths.map((path) => path.trim()).filter((path) => path !== ""),
      });
      return {
        content: [{ type: "text", text: `已登记 ${details.imageIds.length} 张图片到商品档案，可在商品详情页「图片」标签应用。` }],
        details,
      };
    },
  };
}
