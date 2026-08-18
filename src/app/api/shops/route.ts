// 用途：店铺列表与创建接口：GET 返回店铺列表（默认不含已归档），POST 校验参数后创建店铺。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { createShop, listShops } from "@/services/shops.service";

const createSchema = z.object({
  name: z.string({ required_error: "店铺名称不能为空" }).min(1, "店铺名称不能为空"),
  market: z.string({ required_error: "目标市场不能为空" }).min(1, "目标市场不能为空"),
  description: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    return Response.json(await listShops(includeArchived));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await request.json());
    return Response.json(await createShop(input), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
