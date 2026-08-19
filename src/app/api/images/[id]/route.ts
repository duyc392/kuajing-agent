// 用途：单个商品图片档案接口：PATCH 修改应用状态/显示顺序/用途（未知字段严格拒绝），DELETE 删除档案与磁盘文件。
import { z } from "zod";
import { toErrorResponse } from "@/lib/api-error";
import { readJsonBody } from "@/lib/read-body";
import { readShopId } from "@/lib/request-shop";
import { deleteImage, updateImage } from "@/services/images.service";

const updateSchema = z
  .object({
    applied: z.boolean().optional(),
    sortOrder: z.number().int("显示顺序必须是整数").nonnegative("显示顺序不能为负数").optional(),
    type: z.enum(["main", "detail", "variant"]).optional(),
  })
  .strict()
  .refine((input) => input.applied !== undefined || input.sortOrder !== undefined || input.type !== undefined, {
    message: "至少提交一个修改字段（applied / sortOrder / type）",
  });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const input = updateSchema.parse(await readJsonBody(request));
    return Response.json(await updateImage({ id: params.id, shopId: readShopId(request) }, input));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteImage({ id: params.id, shopId: readShopId(request) });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
