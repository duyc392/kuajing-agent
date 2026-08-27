// 用途：商品 DNA 接口：GET 读取（商品无 DNA 时返回 { dna: null }，属于正常态）；PUT 创建或覆盖（一次保存就是全部六个字段）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { getProductDna, upsertProductDna } from "@/services/product-dna.service";

const dnaSchema = z.object({
  targetPersona: z.string().trim().min(1, "核心用户画像不能为空").max(1000, "核心用户画像过长（上限 1000 字）"),
  useScenarios: z.string().trim().min(1, "核心使用场景不能为空").max(1000, "核心使用场景过长（上限 1000 字）"),
  coreSellingPoints: z.string().trim().min(1, "核心卖点不能为空").max(1000, "核心卖点过长（上限 1000 字）"),
  visualHooks: z.string().trim().min(1, "视觉冲击效果不能为空").max(1000, "视觉冲击效果过长（上限 1000 字）"),
  recommendedFormats: z.string().trim().min(1, "推荐视频呈现方式不能为空").max(1000, "推荐视频呈现方式过长（上限 1000 字）"),
  competitorDifferences: z.string().trim().min(1, "竞品差异不能为空").max(1000, "竞品差异过长（上限 1000 字）"),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json({ dna: await getProductDna({ id: params.id, shopId: readShopId(request) }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = dnaSchema.parse(await readJsonBody(request));
    return Response.json({ dna: await upsertProductDna({ id: params.id, shopId: readShopId(request) }, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
