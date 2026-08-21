// 用途：数据导出接口：GET 按 shopId 生成当前店铺数据的 Excel 备份文件，作为附件下载；shopId 必填，失败统一返回 JSON 错误。
import { toErrorResponse } from "@/lib/api-error";
import { ValidationError } from "@/lib/errors";
import { exportExcel } from "@/services/export.service";

export async function GET(request: Request) {
  try {
    const shopId = new URL(request.url).searchParams.get("shopId") ?? "";
    if (shopId === "") throw new ValidationError("缺少 shopId");
    if (shopId.length > 128) throw new ValidationError("shopId 无效");
    const buffer = await exportExcel(shopId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="kuajing-export.xlsx"',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
