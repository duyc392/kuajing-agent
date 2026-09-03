// 用途：选品运行接口（SPEC 6.2）：接收筛选条件，返回 15~20 款候选品（含完整 23 列计算结果）；候选品不落库，由前端沙盒管理。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { runSelection } from "@/services/selection.service";

const runsBody = z.object({
  shopId: z.string({ required_error: "缺少 shopId" }).trim().min(1, "缺少 shopId").max(128, "shopId 无效"),
  filters: z.object({
    targetRegion: z.enum(["US", "UK", "ID"], { required_error: "目标市场必须为 US/UK/ID" }),
    targetCategory: z.string({ required_error: "目标类目不能为空" }).trim().min(1, "目标类目不能为空").max(50, "类目值过长"),
    priceRange: z
      .object({
        min: z.number({ required_error: "售价下限不能为空" }).min(0.01, "售价下限必须为正数").max(100000, "售价下限过大"),
        max: z.number({ required_error: "售价上限不能为空" }).min(0.01, "售价上限必须为正数").max(100000, "售价上限过大"),
      })
      .refine((value) => value.min <= value.max, { message: "售价下限不能大于上限" }),
    minMarginRate: z.number({ required_error: "毛利率下限不能为空" }).min(0, "毛利率下限不能为负").max(1, "毛利率上限不能超过 100%").default(0.45),
    maxWeightGrams: z.number({ required_error: "重量上限不能为空" }).int().min(1, "重量上限至少 1 克").max(100000, "重量上限过大").default(500),
    isProhibitedGoodsExcluded: z.boolean({ required_error: "禁电禁液选项不能为空" }),
    naturalLanguagePrompt: z.string().max(2000, "选品需求描述过长（上限 2000 字符）").optional(),
  }),
});

export async function POST(request: Request) {
  try {
    const body = runsBody.parse(await readJsonBody(request));
    return Response.json(await runSelection({ shopId: body.shopId, filters: body.filters }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
