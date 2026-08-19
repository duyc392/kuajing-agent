// 用途：从请求 URL 读取并校验 shopId 查询参数，所有按店铺隔离的接口共用（缺 shopId 一律 400，杜绝不带隔离条件的查询）。
import { ValidationError } from "@/lib/errors";

export function readShopId(request: Request): string {
  const shopId = new URL(request.url).searchParams.get("shopId");
  if (!shopId) throw new ValidationError("缺少 shopId 参数：操作必须限定店铺");
  return shopId;
}
