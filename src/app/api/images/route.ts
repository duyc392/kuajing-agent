// 用途：商品图片档案接口：GET 按商品 + 店铺查询图片档案；POST 上传卖家图片（PRD 故事 24：上传已有图片后生成变体）。
// 生成入口是 Agent 生图工具，不经过本接口；上传经本接口建档为主图草稿。
import { toErrorResponse } from "@/lib/api-error";
import { readShopId } from "@/lib/request-shop";
import { AppError, ValidationError } from "@/lib/errors";
import { listImages, createUploadedImage } from "@/services/images.service";

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
      form = await request.formData();
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
