// 用途：商品图片生成编排（Agent 层，方向 agent → services/lib；PRD 故事 22-24）：
// 解析商品 → 文本模型组合绘图提示词（审计）→ 调 gpt-image-2 生成/编辑 → 文件写入 public/generated/ →
// 档案入库（草稿状态）。详情图优先用已应用主图做参考（图生图）保持商品主体一致；
// 批量生成受控并发 + 统一时间预算，超预算时如实返回已完成数量；档案入库失败时补偿删除本轮文件。
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { AppError, ValidationError } from "@/lib/errors";
import { readKeysConfig } from "@/lib/config";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { IMAGE_DEFAULTS } from "@/config/models";
import { callWithGenerationAudit } from "@/agent/generate";
import { editImageBytes, generateImageBytes, type ImageApiSettings, type GeneratedImageBytes } from "@/agent/image-api";
import { buildImagePromptSystemPrompt, buildImagePromptUserPrompt, type ImageProductContext, type ImageShopContext } from "@/agent/prompts/image";
import { extensionOfMime, mimeOfExtension } from "@/lib/image-bytes";
import { resolveProductByName } from "@/services/product-lookup.service";
import { getShop } from "@/services/shops.service";
import { listMemories } from "@/services/memory.service";
import { logGeneration } from "@/services/audit.service";
import { createImages, listImages } from "@/services/images.service";
import type { GenerateTextFn, ImageToolDetails, ProductImageType } from "@/types";

export interface RunImageGenerationParams {
  productName: string;
  type: "main" | "detail";
  count: number;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
}

export interface RunImageVariantParams {
  productName: string;
  instruction: string;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
}

const DEFAULT_DETAIL_COUNT = 2;
const BATCH_CONCURRENCY = 2;
const BATCH_BUDGET_MS = 150_000;

// 图片服务配置来自本机 data/config.json；未配置 Key 时给出引导。
async function imageSettings(): Promise<ImageApiSettings> {
  const keys = await readKeysConfig();
  if (!keys.image.apiKey) throw new ValidationError("尚未配置图片生成 API Key，请先在设置页完成配置后再使用图片功能");
  return { apiKey: keys.image.apiKey, baseUrl: keys.image.baseUrl || IMAGE_DEFAULTS.baseUrl, model: keys.image.model || IMAGE_DEFAULTS.model };
}

// 商品与店铺上下文：店铺信息 + 长期记忆（目标市场审美与偏好），注入提示词时统一转义。
async function buildImageContext(shopId: string, productName: string): Promise<{ product: ImageProductContext; shop: ImageShopContext; productId: string }> {
  const product = await resolveProductByName({ productName, shopId });
  const shop = await getShop(shopId);
  const memories = (await listMemories(shopId)).slice(-MAX_CONTEXT_MEMORIES);
  return {
    product: { name: product.name, category: product.category, price: product.price, description: product.description },
    shop: { market: shop.market, memories },
    productId: product.id,
  };
}

// 解析文本模型输出的绘图提示词（容忍代码块围栏与前后杂文）；详情图必须凑足 count 条，数量不足视为格式不合格触发重试。
function parseImagePrompts(text: string, kind: "main" | "detail" | "variant", count: number): string[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AppError("绘图提示词输出格式错误，请重试", "IMAGE_PROMPT_ERROR", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError("绘图提示词输出格式错误，请重试", "IMAGE_PROMPT_ERROR", 502);
  }
  const obj = parsed as Record<string, unknown>;
  if (kind === "detail") {
    const prompts = Array.isArray(obj.prompts) ? obj.prompts.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
    if (prompts.length !== count) throw new AppError(`绘图提示词数量不足（需要 ${count} 条），请重试`, "IMAGE_PROMPT_ERROR", 502);
    return prompts;
  }
  const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
  if (prompt === "") throw new AppError("绘图提示词输出不完整，请重试", "IMAGE_PROMPT_ERROR", 502);
  return [prompt];
}

// 组合绘图提示词：文本模型调用（审计）+ 格式重试。
async function composeImagePrompts(params: {
  kind: "main" | "detail" | "variant";
  count: number;
  product: ImageProductContext;
  shop: ImageShopContext;
  instruction?: string;
  flow: { shopId: string; generateText: GenerateTextFn; signal?: AbortSignal };
}): Promise<string[]> {
  let extra = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const userPrompt = buildImagePromptUserPrompt({
      kind: params.kind,
      product: params.product,
      shop: params.shop,
      count: params.count,
      instruction: params.instruction,
    }) + (extra === "" ? "" : `\n${extra}`);
    const text = await callWithGenerationAudit({
      shopId: params.flow.shopId,
      type: "image",
      modelId: params.flow.generateText.modelId ?? "unknown",
      prompt: userPrompt,
      call: () => params.flow.generateText(buildImagePromptSystemPrompt(params.kind), userPrompt, params.flow.signal),
    });
    try {
      return parseImagePrompts(text, params.kind, params.count);
    } catch {
      extra = `注意：上一版输出不符合要求，请严格按要求的 JSON 格式重新输出恰好 ${params.count} 条提示词。`;
    }
  }
  throw new AppError("绘图提示词生成失败，请重试", "IMAGE_PROMPT_ERROR", 502);
}

// 图片字节落盘：目录自动创建、文件名随机、扩展名按真实 MIME 决定。
async function saveImageFile(bytes: Buffer, mimeType: string): Promise<string> {
  const dir = path.join(process.cwd(), "public", "generated");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extensionOfMime(mimeType as "image/png" | "image/jpeg" | "image/webp")}`;
  await fs.writeFile(path.join(dir, filename), bytes);
  return `/generated/${filename}`;
}

// 补偿清理：档案入库失败时删除本轮已写文件（尽力而为）。
async function rollbackFiles(paths: string[]): Promise<void> {
  for (const savedPath of paths) {
    try {
      await fs.unlink(path.join(process.cwd(), "public", savedPath.replace(/^\/+/, "")));
    } catch {
      // 清理尽力而为。
    }
  }
}

// 详情图参考图：已应用主图优先，其次任意主图；没有主图返回 null（退化为文生图并如实说明）。
async function findDetailReference(productId: string, shopId: string): Promise<{ path: string } | null> {
  const images = await listImages(productId, shopId);
  return images.find((image) => image.type === "main" && image.applied) ?? images.find((image) => image.type === "main") ?? null;
}

// 受控并发批量生成：并发上限 2 + 统一 150 秒预算；预算耗尽时中止未完成项，返回已完成部分与未完成数量。
async function generateBatchWithBudget(params: {
  prompts: string[];
  shopId: string;
  settings: ImageApiSettings;
  signal?: AbortSignal;
  generate: (prompt: string, signal: AbortSignal) => Promise<GeneratedImageBytes>;
}): Promise<{ paths: string[]; savedPrompts: string[]; incomplete: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCH_BUDGET_MS);
  const onAbort = () => controller.abort(params.signal?.reason);
  params.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const results: Array<{ path: string; prompt: string } | null> = new Array(params.prompts.length).fill(null);
    let cursor = 0;
    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= params.prompts.length) return;
        if (controller.signal.aborted) return;
        const prompt = params.prompts[index];
        try {
          const { bytes, mimeType } = await params.generate(prompt, controller.signal);
          const savedPath = await saveImageFile(bytes, mimeType);
          results[index] = { path: savedPath, prompt };
          await logGeneration({ shopId: params.shopId, type: "image", model: params.settings.model, prompt, output: savedPath, status: "success" });
        } catch (error) {
          const aborted = controller.signal.aborted && !params.signal?.aborted;
          await logGeneration({
            shopId: params.shopId,
            type: "image",
            model: params.settings.model,
            prompt,
            status: "error",
            error: aborted ? "图片生成超时中止" : error instanceof Error ? error.message : "未知错误",
          });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, params.prompts.length) }, worker));
    const completed = results.filter((item): item is { path: string; prompt: string } => item !== null);
    return {
      paths: completed.map((item) => item.path),
      savedPrompts: completed.map((item) => item.prompt),
      incomplete: params.prompts.length - completed.length,
    };
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener("abort", onAbort);
  }
}

// 故事 22/23：主图（1 张）与详情图序列（并发 + 预算）。详情图优先以已应用主图为参考图生图，保持商品主体一致。
// 生成结果以草稿入库；档案入库失败时补偿删除本轮文件并留失败审计。
export async function runProductImageGeneration(params: RunImageGenerationParams): Promise<ImageToolDetails> {
  const { product, shop, productId } = await buildImageContext(params.shopId, params.productName);
  const count = params.type === "main" ? 1 : (params.count || DEFAULT_DETAIL_COUNT);
  const prompts = await composeImagePrompts({
    kind: params.type,
    count,
    product,
    shop,
    flow: { shopId: params.shopId, generateText: params.generateText, signal: params.signal },
  });
  const settings = await imageSettings();

  let reference: { bytes: Buffer; mimeType: string } | null = null;
  if (params.type === "detail") {
    const ref = await findDetailReference(productId, params.shopId);
    if (ref) {
      try {
        const bytes = await fs.readFile(path.join(process.cwd(), "public", ref.path.replace(/^\/+/, "")));
        reference = { bytes, mimeType: mimeOfExtension(ref.path) };
      } catch {
        reference = null;
      }
    }
  }
  const generate = reference
    ? (prompt: string, signal: AbortSignal) => editImageBytes(settings, reference as { bytes: Buffer; mimeType: string }, prompt, signal)
    : (prompt: string, signal: AbortSignal) => generateImageBytes(settings, prompt, signal);

  const { paths, savedPrompts, incomplete } = await generateBatchWithBudget({
    prompts,
    shopId: params.shopId,
    settings,
    signal: params.signal,
    generate,
  });
  if (paths.length === 0) {
    throw new AppError("图片生成未完成，请稍后重试", "IMAGE_GENERATE_FAILED", 502);
  }
  const existing = await listImages(productId, params.shopId);
  const maxSortOrder = existing.reduce((max, image) => Math.max(max, image.sortOrder), 0);
  try {
    const views = await createImages(productId, params.shopId, paths.map((savedPath, index) => ({
      path: savedPath,
      type: params.type as ProductImageType,
      prompt: savedPrompts[index] ?? savedPrompts[0],
      sortOrder: maxSortOrder + 1 + index,
    })));
    return { productName: product.name, type: params.type, imageCount: views.length, paths: views.map((view) => view.path), incomplete };
  } catch (error) {
    await rollbackFiles(paths);
    await logGeneration({
      shopId: params.shopId,
      type: "image",
      model: settings.model,
      prompt: savedPrompts.join(" | "),
      status: "error",
      error: "图片档案入库失败，已删除本轮文件",
    });
    throw error;
  }
}

// 故事 24：基于商品已有图片生成变体（默认取已应用的主图），保持主体一致、只改背景或场景。
export async function runImageVariantGeneration(params: RunImageVariantParams): Promise<ImageToolDetails> {
  const { product, shop, productId } = await buildImageContext(params.shopId, params.productName);
  const existing = await listImages(productId, params.shopId);
  const reference = existing.find((image) => image.type === "main" && image.applied) ?? existing[0];
  if (!reference) throw new ValidationError("该商品还没有图片，请先生成主图或上传图片再生成变体");
  let referenceBytes: Buffer;
  try {
    referenceBytes = await fs.readFile(path.join(process.cwd(), "public", reference.path.replace(/^\/+/, "")));
  } catch {
    throw new AppError("参考图片文件缺失，请重新生成商品图片后再试", "IMAGE_REFERENCE_MISSING", 404);
  }
  const prompts = await composeImagePrompts({
    kind: "variant",
    count: 1,
    product,
    shop,
    instruction: params.instruction,
    flow: { shopId: params.shopId, generateText: params.generateText, signal: params.signal },
  });
  const settings = await imageSettings();
  let savedPath = "";
  try {
    const { bytes, mimeType } = await editImageBytes(settings, { bytes: referenceBytes, mimeType: mimeOfExtension(reference.path) }, prompts[0], params.signal);
    savedPath = await saveImageFile(bytes, mimeType);
    await logGeneration({ shopId: params.shopId, type: "image", model: settings.model, prompt: prompts[0], output: savedPath, status: "success" });
    const maxSortOrder = existing.reduce((max, image) => Math.max(max, image.sortOrder), 0);
    const views = await createImages(productId, params.shopId, [{
      path: savedPath,
      type: "variant",
      prompt: prompts[0],
      sortOrder: maxSortOrder + 1,
    }]);
    return { productName: product.name, type: "variant", imageCount: views.length, paths: views.map((view) => view.path) };
  } catch (error) {
    if (savedPath !== "") await rollbackFiles([savedPath]);
    await logGeneration({
      shopId: params.shopId,
      type: "image",
      model: settings.model,
      prompt: prompts[0],
      status: "error",
      error: error instanceof Error ? error.message : "未知错误",
    });
    throw error;
  }
}
