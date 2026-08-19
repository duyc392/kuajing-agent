// 用途：生成审计业务逻辑（PRD 数据对象 Generation：每次 AI 调用留一条记录，含类型、模型、输入摘要、输出摘要、状态）。
// 审计只影响留痕，不影响主流程：写库失败仅记录服务端日志，绝不向上抛错。
import { prisma } from "@/lib/db";
import type { GenerationInput } from "@/types";

const PROMPT_SUMMARY_MAX = 500;
const OUTPUT_SUMMARY_MAX = 500;

// 审计只存摘要，不存全文：控制 SQLite 体积，也避免把完整商品信息/长文落进审计表。
function summarize(text: string | undefined, max: number): string | null {
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

// 记录一次 AI 调用：shopId 缺失（历史数据/异常上下文）时静默跳过，其余失败只写日志。
export async function logGeneration(input: GenerationInput): Promise<void> {
  if (!input.shopId) return;
  try {
    await prisma.generation.create({
      data: {
        shopId: input.shopId,
        type: input.type,
        model: input.model,
        prompt: summarize(input.prompt, PROMPT_SUMMARY_MAX),
        output: summarize(input.output, OUTPUT_SUMMARY_MAX),
        status: input.status,
        error: input.error ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] 生成审计写入失败:", error);
  }
}
