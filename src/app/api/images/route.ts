// 用途：商品图片档案接口：GET 按商品 + 店铺查询图片档案；POST 上传卖家图片（PRD 故事 24：上传已有图片后生成变体）。
// 生成入口是 Agent 生图工具，不经过本接口；上传经本接口建档为主图草稿。
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { AppError, ValidationError } from "@/lib/errors";
import { listImages, createUploadedImage } from "@/services/images.service";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function readUploadForm(request: Request): Promise<FormData> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) throw new ValidationError("上传内容不能超过 10MB");
  if (contentLength > 0) return request.formData();
  if (!request.body) throw new AppError("上传内容不是合法的文件表单", "UPLOAD_INVALID", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_UPLOAD_BYTES + 64 * 1024) {
        await reader.cancel();
        throw new ValidationError("上传内容不能超过 10MB");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId") ?? "";
    if (productId === "" || productId.length > 128) throw new ValidationError("缺少商品 ID 或格式无效");
    return Response.json(await listImages(productId, readShopId(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId") ?? "";
    if (productId === "" || productId.length > 128) throw new ValidationError("缺少商品 ID 或格式无效");
    let form: FormData;
    try {
      form = await readUploadForm(request);
    } catch {
      throw new AppError("上传内容不是合法的文件表单", "UPLOAD_INVALID", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("缺少上传文件（字段名 file）");
    const bytes = Buffer.from(await file.arrayBuffer());
    const view = await createUploadedImage(productId, readShopId(request), { bytes });
    return Response.json(view, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
