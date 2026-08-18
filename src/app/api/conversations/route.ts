// 用途：对话接口：GET 按 shopId 查询对话列表（时间倒序），POST 在指定店铺下新建对话；shopId 必填，店铺不存在返回 404。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { ValidationError } from "@/lib/errors";
import { createConversation, listConversations } from "@/services/conversations.service";

const createSchema = z.object({
  shopId: z.string({ required_error: "缺少 shopId" }).min(1, "缺少 shopId").max(128, "shopId 无效"),
  title: z.string().trim().min(1, "对话标题不能为空").max(100, "对话标题过长（上限 100 字）").optional(),
});

export async function GET(request: Request) {
  try {
    const shopId = new URL(request.url).searchParams.get("shopId") ?? "";
    if (shopId === "") throw new ValidationError("缺少 shopId");
    if (shopId.length > 128) throw new ValidationError("shopId 无效");
    return Response.json(await listConversations(shopId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await readJsonBody(request));
    return Response.json(await createConversation(input), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
