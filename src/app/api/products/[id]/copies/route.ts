// 用途：文案版本接口：GET 按店铺查询商品的全部文案版本（倒序）；POST 切换当前版本（故事 19 版本切换，校验商品与版本归属，跨店铺 404）。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { listCopies, setCurrentCopy } from "@/services/product-copies.service";

const switchSchema = z.object({
  copyId: z.string({ required_error: "缺少 copyId" }).min(1, "缺少 copyId").max(128, "copyId 无效"),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    return Response.json(await listCopies(params.id, readShopId(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = switchSchema.parse(await readJsonBody(request));
    return Response.json(await setCurrentCopy({ productId: params.id, copyId: input.copyId, shopId: readShopId(request) }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
