// 用途：API 中间件（Next.js 框架约定文件）：所有 /api/* 请求先过本机守卫，非本机请求一律 403。
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { localRequestViolation } from "@/lib/request-guard";

export function middleware(request: NextRequest) {
  const violation = localRequestViolation(request.headers.get("host"), request.headers.get("origin"));
  if (violation) {
    return NextResponse.json({ error: violation, code: "FORBIDDEN" }, { status: 403 });
  }
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    // 写接口只接受 JSON：拒绝 text/plain 等免预检跨站提交。
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "禁止访问：仅接受 JSON 请求", code: "FORBIDDEN" }, { status: 403 });
    }
  }
  // 说明：不在中间件按 Content-Length 拒流——实测"声明大 body 但只发小 body"的请求会让服务器与客户端互相等待挂死
  //（中间件执行前 Next 已开始等 body）。字段级上限由各接口的 zod .max() 在解析后拦截，对单用户本机部署足够。
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
