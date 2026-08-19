// 用途：直播脚本列表接口：GET 按当前店铺查询直播脚本（脚本创建经对话工具完成，本接口只读）。
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { listLiveScripts } from "@/services/live-scripts.service";

export async function GET(request: Request) {
  try {
    return Response.json(await listLiveScripts(readShopId(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
