// 用途：脚本列表接口：GET 按当前店铺查询视频脚本（脚本创建经对话工具完成，本接口只读；直播脚本为后续功能）。
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { listScripts } from "@/services/video-scripts.service";

export async function GET(request: Request) {
  try {
    return Response.json(await listScripts(readShopId(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
