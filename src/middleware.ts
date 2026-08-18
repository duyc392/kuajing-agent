// 用途：API 中间件（Next.js 框架约定文件）：所有 /api/* 请求先过本机守卫，非本机请求一律 403。
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { localRequestViolation } from "@/lib/request-guard";

export function middleware(request: NextRequest) {
  const violation = localRequestViolation(request.headers.get("host"), request.headers.get("origin"));
  if (violation) {
    return NextResponse.json({ error: violation, code: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
