// 用途：文案生成编排（Agent 层，方向 agent → services/lib）：按商品名解析商品、注入上一版正文、调用模型生成（每次调用记录生成审计）、
// 解析与市场规则校验（有限重试）、存库并返回结构化结果。
import { AppError } from "@/lib/errors";
import { callWithGenerationAudit } from "@/agent/generate";
import { createCopy, listCopies } from "@/services/product-copies.service";
import { listMemories } from "@/services/memory.service";
import { MAX_CONTEXT_MEMORIES } from "@/config/memory";
import { resolveProductByName } from "@/services/product-lookup.service";
import { buildCopySystemPrompt, buildCopyUserPrompt, type CopyProductContext, type PreviousCopyContext } from "@/agent/prompts/copy";
import type { CopyToolDetails, GenerateTextFn } from "@/types";

export interface RunCopyGenerationParams {
  productName: string;
  language: string;
  feedback?: string;
  shopId: string;
  generateText: GenerateTextFn;
  signal?: AbortSignal;
}

interface ParsedCopy {
  title: string;
  description: string;
  sellingPoints: string;
}

const MAX_RULE_RETRIES = 2;

// 从模型输出中解析 JSON（容忍代码块围栏与前后杂文），字段缺失或格式错误抛中文错误。
function parseCopyJson(text: string): ParsedCopy {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AppError("文案模型输出格式错误，请重试", "COPY_PARSE_ERROR", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError("文案模型输出格式错误，请重试", "COPY_PARSE_ERROR", 502);
  }
  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  if (title === "" || description === "") throw new AppError("文案模型输出不完整，请重试", "COPY_PARSE_ERROR", 502);
  const sellingPoints = typeof obj.sellingPoints === "string" ? obj.sellingPoints.trim() : "";
  const benefits = typeof obj.benefits === "string" ? obj.benefits.trim() : "";
  return {
    title: title.slice(0, 255),
    description,
    sellingPoints: [sellingPoints, benefits].filter((part) => part !== "").join("\n"),
  };
}

// 市场规则校验：美区（en）文案必须同时提到 free shipping 与 reviews（PRD 故事 17 验收标准）。
function violatesMarketRule(language: string, copy: ParsedCopy): boolean {
  if (language !== "en") return false;
  const haystack = `${copy.description}\n${copy.sellingPoints}`.toLowerCase();
  return !haystack.includes("free shipping") || !haystack.includes("review");
}

// 反馈修改的确定性字段保留：意见只点名某个字段时，其余字段直接复用上一版（不依赖模型自觉遵守提示词）。
function preserveUntouchedFields(generated: ParsedCopy, previous: PreviousCopyContext | null, feedback?: string): ParsedCopy {
  if (!previous || !feedback) return generated;
  const mentionsTitle = /标题/.test(feedback);
  const mentionsDescription = /描述|详情|介绍/.test(feedback);
  const mentionsPoints = /卖点|利益点/.test(feedback);
  const result = { ...generated };
  if (!mentionsTitle && (mentionsDescription || mentionsPoints)) result.title = previous.title;
  if (!mentionsDescription && (mentionsTitle || mentionsPoints)) result.description = previous.description;
  if (!mentionsPoints && (mentionsTitle || mentionsDescription)) result.sellingPoints = previous.sellingPoints ?? "";
  return result;
}

// 反馈修改时加载当前版本正文（注入提示词保证只改意见涉及的部分）；无反馈或无当前版本返回 null。
async function loadPreviousCopy(productId: string, shopId: string, feedback?: string): Promise<PreviousCopyContext | null> {
  if (!feedback) return null;
  const versions = await listCopies(productId, shopId);
  const current = versions.find((copy) => copy.isCurrent);
  if (!current) return null;
  return { title: current.title, description: current.description, sellingPoints: current.sellingPoints };
}

export async function runCopyGeneration(params: RunCopyGenerationParams): Promise<CopyToolDetails> {
  const product = await resolveProductByName({ productName: params.productName, shopId: params.shopId });
  const productContext: CopyProductContext = {
    name: product.name,
    category: product.category,
    price: product.price,
    description: product.description,
    skuRule: product.skuRule,
  };
  const previous = await loadPreviousCopy(product.id, params.shopId, params.feedback);
  // 店铺长期记忆注入文案生成（PRD 故事 40：定位与偏好自动应用），受条数上限约束。
  const memories = (await listMemories(params.shopId)).slice(-MAX_CONTEXT_MEMORIES);
  let extraInstruction = "";
  let parsed: ParsedCopy | null = null;
  for (let attempt = 0; attempt < MAX_RULE_RETRIES; attempt++) {
    const userPrompt = buildCopyUserPrompt(productContext, params.feedback, previous, memories) + (extraInstruction === "" ? "" : `\n${extraInstruction}`);
    const text = await callWithGenerationAudit({
      shopId: params.shopId,
      type: "copywriting",
      modelId: params.generateText.modelId ?? "unknown",
      prompt: userPrompt,
      call: () => params.generateText(buildCopySystemPrompt(params.language), userPrompt, params.signal),
    });
    parsed = preserveUntouchedFields(parseCopyJson(text), previous, params.feedback);
    if (!violatesMarketRule(params.language, parsed)) break;
    extraInstruction = "注意：上一版未满足市场要求，英文文案必须同时出现 free shipping 和 reviews，请重写。";
    if (attempt === MAX_RULE_RETRIES - 1) {
      throw new AppError("生成的英文文案缺少 free shipping 或 reviews 卖点，请重试", "COPY_RULE_ERROR", 502);
    }
  }
  if (!parsed) throw new AppError("文案生成失败，请重试", "COPY_GENERATE_ERROR", 502);
  const copy = await createCopy({
    productId: product.id,
    shopId: params.shopId,
    title: parsed.title,
    description: parsed.description,
    sellingPoints: parsed.sellingPoints === "" ? null : parsed.sellingPoints,
    language: params.language,
    source: "ai",
  });
  return {
    copyId: copy.id,
    productId: copy.productId,
    title: copy.title,
    description: copy.description,
    sellingPoints: copy.sellingPoints ?? "",
    language: copy.language,
    version: copy.version,
    isCurrent: copy.isCurrent,
  };
}
