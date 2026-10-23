// 用途：固定出图工作流的提示词模板（可信常量配置）：把「换背景 / 换装 / 分镜草图 / 纯文生图」的场景差异
// 收敛成一套固定措辞，保证同款商品多次生成风格一致。模板只做字符串填充，不含任何判断逻辑。
// 与 render_product_image 共用同一个生图模型与接口（data/config.json 的 image 分组），只是提示词由模板拼成。
import { IMAGE_WORKFLOW_DEFAULTS } from "@/config/integrations";
import { ValidationError } from "@/lib/errors";
import type { ImageWorkflow } from "@/types";

export interface ImageWorkflowTemplate {
  label: string;
  description: string;
  /** 是否必须提供商品原图（换背景、换装必须，保持商品主体不变） */
  requiresReference: boolean;
  /** {{subject}} = 商品主体英文描述；{{scene}} = 场景英文描述 */
  template: string;
}

export const IMAGE_WORKFLOW_TEMPLATES: Record<ImageWorkflow, ImageWorkflowTemplate> = {
  "text-to-image": {
    label: "纯文生图",
    description: "从文字描述生成商品主图/场景图，无需原图",
    requiresReference: false,
    template:
      "Professional e-commerce product photography of {{subject}}, {{scene}}, " +
      "seamless clean background, soft diffused studio lighting, centered composition, " +
      "high-end commercial look, sharp focus, no text, no watermark, 4k",
  },
  "background-replace": {
    label: "白底图换背景",
    description: "保留商品主体，把白底图换成生活使用场景",
    requiresReference: true,
    template:
      "Keep the product exactly as it is in the reference image: same shape, color, label and proportions. " +
      "Place {{subject}} in {{scene}}, natural daylight, realistic contact shadows, " +
      "shallow depth of field, lifestyle product photography, sharp product detail, no text, 4k",
  },
  "model-swap": {
    label: "模特换装",
    description: "保留商品款式与配色，加入模特穿戴场景",
    requiresReference: true,
    template:
      "Keep the product design, pattern and color unchanged from the reference image. " +
      "{{subject}} worn by a model in {{scene}}, natural relaxed pose, soft studio lighting, " +
      "editorial lifestyle photography, visible fabric texture, no text, 4k",
  },
  storyboard: {
    label: "分镜草图",
    description: "把分镜画面描述生成参考画面，供拍摄或剪辑对照",
    requiresReference: false,
    template:
      "Cinematic storyboard frame: {{subject}}, {{scene}}, film still look, natural lighting, " +
      "handheld camera angle, realistic texture, vertical 9:16 composition, no text, no watermark, 4k",
  },
};

const PLACEHOLDER = /\{\{(subject|scene)\}\}/g;

// 模板填充：只替换占位符并压缩多余空白；缺失的必填项直接报错，不静默留空。
export function buildWorkflowPrompt(workflow: ImageWorkflow, subject: string, scene: string): string {
  const cleaned = { subject: subject.trim(), scene: scene.trim() };
  if (cleaned.subject === "") throw new ValidationError("subject 不能为空：请用英文描述商品主体");
  if (cleaned.scene === "") throw new ValidationError("scene 不能为空：请用英文描述画面场景");
  const filled = IMAGE_WORKFLOW_TEMPLATES[workflow].template.replace(
    PLACEHOLDER,
    (_match, key: "subject" | "scene") => cleaned[key],
  );
  return filled.replace(/\s+/g, " ").trim();
}

export function requiresReference(workflow: ImageWorkflow): boolean {
  return IMAGE_WORKFLOW_TEMPLATES[workflow].requiresReference;
}

export const WORKFLOW_MAX_IMAGES = IMAGE_WORKFLOW_DEFAULTS.maxImages;
