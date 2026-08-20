// 用途：看板数据接口（PRD 故事 31）：GET 按店铺名 + 当前工作台店铺的市场实时查询 FastMoss，不落库。
// 额度提示：每次查询消耗 5 次 FastMoss 计量调用（店铺搜索 + 4 项分析，约 5 credit）；前端已用防连点锁。
// 本机单用户 + Origin 守卫下暂不加服务端限流；若日后开放多用户，必须先在此补频次限制。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { marketToRegion } from "@/lib/markets";
import { ValidationError } from "@/lib/errors";
import { getShop } from "@/services/shops.service";
import { getDashboard } from "@/services/dashboard.service";

const querySchema = z.object({
  shopName: z.string().trim().min(1, "店铺名称不能为空").max(200, "店铺名称过长（上限 200 字）"),
  timeRangeDays: z.enum(["7", "28", "90"]).default("28"),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({
      shopName: url.searchParams.get("shopName") ?? "",
      timeRangeDays: url.searchParams.get("timeRangeDays") ?? "28",
    });
    // shopId 铁律：以当前工作台店铺的市场推导查询地域，市场不支持时明确报错。
    const shop = await getShop(readShopId(request));
    const region = marketToRegion(shop.market);
    if (!region) throw new ValidationError("当前店铺市场暂不支持数据看板查询");
    return Response.json(await getDashboard({
      shopName: input.shopName,
      region,
      timeRangeDays: Number(input.timeRangeDays) as 7 | 28 | 90,
    }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
