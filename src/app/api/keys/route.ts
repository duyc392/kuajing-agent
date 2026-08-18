// 用途：密钥接口：GET 返回三个 Key 的脱敏状态（不返回全文），POST 校验并保存到服务端本地配置文件。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { getKeysStatus, saveKeys } from "@/services/keys.service";

const saveSchema = z.object({
  llm: z
    .object({
      apiKey: z.string().min(1, "对话模型的 API Key 不能为空").optional(),
      baseUrl: z.string().url("对话模型接口地址格式不正确").optional(),
      model: z.string().min(1, "对话模型名称不能为空").optional(),
      memoryModel: z.string().min(1, "记忆提取模型名称不能为空").optional(),
    })
    .optional(),
  image: z
    .object({
      apiKey: z.string().min(1, "生图模型的 API Key 不能为空").optional(),
      baseUrl: z.string().url("生图模型接口地址格式不正确").optional(),
      model: z.string().min(1, "生图模型名称不能为空").optional(),
    })
    .optional(),
  fastmoss: z
    .object({
      apiKey: z.string().min(1, "FastMoss 的 API Key 不能为空").optional(),
      baseUrl: z.string().url("FastMoss 接口地址格式不正确").optional(),
    })
    .optional(),
}).refine(
  (data) => Object.values(data).some((group) => group !== undefined && Object.values(group).some((v) => v !== undefined)),
  { message: "至少填写一项配置再保存" },
);

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(await getKeysStatus(), { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = saveSchema.parse(await request.json());
    return Response.json(await saveKeys(input), { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}
