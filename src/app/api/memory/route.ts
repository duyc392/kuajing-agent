// 用途：记忆条目列表接口：GET 按当前店铺查询 Agent 长期记忆（记忆新增由对话结束后的提取器完成，本接口只读）。
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { listMemories } from "@/services/memory.service";

export async function GET(request: Request) {
  try {
    return Response.json(await listMemories(readShopId(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
