// 用途：API 中间件（Next.js 框架约定文件）：所有 /api/* 请求先过本机守卫（Host + Origin + Sec-Fetch-Site 三重校验），
// 非本机或跨站请求一律 403；业务响应统一禁止缓存（浏览器/代理不落盘业务内容）。
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { crossSiteFetchViolation, localRequestViolation } from "@/lib/request-guard";

function forbidden(message: string): NextResponse {
  return new NextResponse(JSON.stringify({ error: message, code: "FORBIDDEN" }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function middleware(request: NextRequest) {
  const violation =
    localRequestViolation(request.headers.get("host"), request.headers.get("origin")) ??
    crossSiteFetchViolation(request.headers.get("sec-fetch-site"));
  if (violation) {
    return forbidden(violation);
  }
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    // 带请求体的写接口只接受 JSON（拒绝 text/plain 等免预检跨站提交）；无 body 的 DELETE 等不受限。
    // 唯一例外：POST /api/images 接受 multipart/form-data 上传（PRD 故事 24 图片上传），大小与签名由接口内校验。
    const contentType = request.headers.get("content-type") ?? "";
    const isImageUpload = method === "POST" && request.nextUrl.pathname === "/api/images" && contentType.includes("multipart/form-data");
    const hasBody = Number(request.headers.get("content-length") ?? "0") > 0;
    if (hasBody && !contentType.includes("application/json") && !isImageUpload) {
      return forbidden("禁止访问：仅接受 JSON 请求");
    }
  }
  // 说明：不在中间件按 Content-Length 拒流——实测"声明大 body 但只发小 body"的请求会让服务器与客户端互相等待挂死
  //（中间件执行前 Next 已开始等 body）。字段级上限由各接口的 zod .max() 在解析后拦截，对单用户本机部署足够。
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
