// 用途：密钥接口：GET 返回三个 Key 的脱敏状态（不返回全文），POST 校验并保存到服务端本地配置文件。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { baseUrlViolation } from "@/lib/urls";
import { getKeysStatus, saveKeys } from "@/services/keys.service";

const keySchema = z.string().trim().min(1, "API Key 不能为空").max(512, "API Key 过长（上限 512 字符）");
const baseUrlSchema = (label: string) =>
  z
    .string({ required_error: `${label}接口地址不能为空` })
    .url(`${label}接口地址格式不正确`)
    .max(2048, `${label}接口地址过长（上限 2048 字符）`)
    .refine((value) => baseUrlViolation(value) === null, { message: "接口地址必须是 https（仅本机回环地址允许 http），且不能包含账号密码" });
const modelSchema = (label: string) => z.string().trim().min(1, `${label}模型名称不能为空`).max(100, `${label}模型名称过长（上限 100 字符）`);

const saveSchema = z.object({
  llm: z
    .object({
      apiKey: keySchema.optional(),
      baseUrl: baseUrlSchema("对话模型").optional(),
      model: modelSchema("对话").optional(),
      memoryModel: modelSchema("记忆提取").optional(),
    })
    .optional(),
  image: z
    .object({
      apiKey: keySchema.optional(),
      baseUrl: baseUrlSchema("生图模型").optional(),
      model: modelSchema("生图").optional(),
    })
    .optional(),
  fastmoss: z
    .object({
      apiKey: keySchema.optional(),
      baseUrl: baseUrlSchema("FastMoss").optional(),
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
    const input = saveSchema.parse(await readJsonBody(request));
    return Response.json(await saveKeys(input), { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}
