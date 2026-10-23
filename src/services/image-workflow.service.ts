// 用途：固定工作流出图服务：把模板 + 主体 + 场景拼成完整英文提示词，再走与 render_product_image 相同的生图 API。
// 只做「填模板 + 调生图 + 返回路径」；为什么画这个场景、卖点是什么，由主 Agent 按 SOP 决定后传参。
import { ValidationError } from "@/lib/errors";
import { buildWorkflowPrompt, requiresReference } from "@/lib/image-workflows";
import { renderToFiles } from "@/services/image-render.service";
import { IMAGE_WORKFLOW_DEFAULTS } from "@/config/integrations";
import type { ImageWorkflow, ImageWorkflowDetails } from "@/types";

export interface RunImageWorkflowInput {
  workflow: ImageWorkflow;
  /** 商品主体英文描述 */
  subject: string;
  /** 场景英文描述 */
  scene: string;
  count: number;
  referencePublicPath?: string;
  referenceUrl?: string;
  signal?: AbortSignal;
}

export async function runImageWorkflow(input: RunImageWorkflowInput): Promise<ImageWorkflowDetails> {
  if (requiresReference(input.workflow) && !input.referencePublicPath && !input.referenceUrl) {
    throw new ValidationError("该工作流需要商品原图：请传 referencePath（站内路径）或 referenceUrl（https 链接），否则商品主体会变样");
  }
  const prompt = buildWorkflowPrompt(input.workflow, input.subject, input.scene);
  const result = await renderToFiles({
    prompt,
    count: Math.min(Math.max(Math.floor(input.count), 1), IMAGE_WORKFLOW_DEFAULTS.maxImages),
    referencePublicPath: input.referencePublicPath,
    referenceUrl: input.referenceUrl,
    signal: input.signal,
  });
  return {
    workflow: input.workflow,
    prompt,
    imageCount: result.paths.length,
    paths: result.paths,
    incomplete: result.incomplete,
  };
}
