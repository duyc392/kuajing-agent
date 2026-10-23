// 用途：图片渲染底层服务：按给定英文提示词调用生图 API（有参考图走编辑接口），把成品写入 public/generated 并返回路径。
// 只负责「出图 + 落盘」，不生成提示词、不写数据库档案；自由出图（render_product_image）与固定工作流（run_image_workflow）共用它。
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { IMAGE_WORKFLOW_DEFAULTS } from "@/config/integrations";
import { readKeysConfig } from "@/lib/config";
import { AppError, ValidationError } from "@/lib/errors";
import { detectImageMime, extensionOfMime, type AllowedImageMime } from "@/lib/image-bytes";
import { downloadRemoteImage, editImageBytes, generateImageBytes, type ImageApiSettings } from "@/lib/image-client";
import { resolvePublicDiskPath } from "@/lib/public-path";
import type { ProductImageType, RenderImageDetails } from "@/types";

const OUTPUT_DIR = path.join(process.cwd(), "public", "generated");
const ASCII_ONLY = /^[\x20-\x7E]+$/;

export interface RenderToFilesInput {
  /** 英文提示词：由主 Agent 或固定模板提供 */
  prompt: string;
  count: number;
  /** 参考图（站内路径），与 referenceUrl 二选一 */
  referencePublicPath?: string;
  /** 参考图（https 链接），与 referencePublicPath 二选一 */
  referenceUrl?: string;
  signal?: AbortSignal;
}

export interface RenderToFilesResult {
  paths: string[];
  incomplete: number;
}

interface ReferenceImage {
  bytes: Buffer;
  mimeType: AllowedImageMime;
}

async function imageSettings(): Promise<ImageApiSettings> {
  const keys = await readKeysConfig();
  if (!keys.image.apiKey) {
    throw new ValidationError("尚未配置图片生成 API Key，请先在设置页完成配置");
  }
  return keys.image;
}

async function readReference(input: RenderToFilesInput): Promise<ReferenceImage | null> {
  if (input.referencePublicPath) {
    const diskPath = resolvePublicDiskPath(input.referencePublicPath);
    if (diskPath === null) throw new ValidationError("参考图路径不合法");
    const bytes = await fs.readFile(diskPath);
    const mimeType = detectImageMime(bytes);
    if (!mimeType) throw new ValidationError("参考图格式不支持（仅 PNG / JPEG / WebP）");
    return { bytes, mimeType };
  }
  if (input.referenceUrl) {
    return downloadRemoteImage(input.referenceUrl, input.signal);
  }
  return null;
}

async function saveImage(bytes: Buffer, mimeType: AllowedImageMime): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extensionOfMime(mimeType)}`;
  await fs.writeFile(path.join(OUTPUT_DIR, filename), bytes);
  return `/generated/${filename}`;
}

// 时间预算：一次工具调用不能无限拉长 Agent 回合，超预算时如实返回未完成数量。
export async function renderToFiles(input: RenderToFilesInput): Promise<RenderToFilesResult> {
  if (!ASCII_ONLY.test(input.prompt)) throw new ValidationError("图片提示词必须是英文（不能含中文或全角字符）");
  const count = Math.min(Math.max(Math.floor(input.count), 1), IMAGE_WORKFLOW_DEFAULTS.maxImages);
  const settings = await imageSettings();
  const reference = await readReference(input);
  const deadline = Date.now() + IMAGE_WORKFLOW_DEFAULTS.budgetMs;
  const paths: string[] = [];
  let incomplete = 0;
  for (let index = 0; index < count; index += 1) {
    if (Date.now() > deadline) {
      incomplete = count - index;
      break;
    }
    try {
      const generated = reference
        ? await editImageBytes(settings, reference, input.prompt, input.signal)
        : await generateImageBytes(settings, input.prompt, input.signal);
      paths.push(await saveImage(generated.bytes, generated.mimeType));
    } catch (error) {
      // 已经出一部分图时保留成果并如实报告；一张都没出则抛出原始错误。
      if (paths.length === 0) throw error;
      incomplete = count - index;
      console.error("[image-render] 后续图片生成失败（已保留成品）:", error);
      break;
    }
  }
  if (paths.length === 0) throw new AppError("图片生成失败，请稍后重试", "IMAGE_EMPTY", 502);
  return { paths, incomplete };
}

export interface RenderImageInput {
  productName: string;
  type: ProductImageType;
  /** 英文提示词：由主 Agent 按视觉 SOP 写好 */
  prompt: string;
  count: number;
  /** 变体/详情图可选的参考图（public 相对路径） */
  referencePublicPath?: string;
  signal?: AbortSignal;
}

export async function renderImages(input: RenderImageInput): Promise<RenderImageDetails> {
  const result = await renderToFiles({
    prompt: input.prompt,
    count: input.count,
    referencePublicPath: input.referencePublicPath,
    signal: input.signal,
  });
  return {
    productName: input.productName,
    type: input.type,
    prompt: input.prompt,
    imageCount: result.paths.length,
    paths: result.paths,
    incomplete: result.incomplete,
  };
}
