// 用途：本机访问守卫：校验请求的 Host 与 Origin 只允许本机回环地址，拦截局域网设备、恶意网页跨站伪造与 DNS 重绑定攻击。
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(value: string): string {
  return value.replace(/:\d+$/, "").trim().toLowerCase();
}

export function localRequestViolation(host: string | null, origin: string | null): string | null {
  const hostName = hostnameOf(host ?? "");
  if (!LOCAL_HOSTNAMES.has(hostName)) return "禁止访问：本服务只允许本机使用";
  if (origin) {
    try {
      const originName = hostnameOf(new URL(origin).hostname);
      if (!LOCAL_HOSTNAMES.has(originName)) return "禁止访问：不允许跨站请求";
    } catch {
      return "禁止访问：请求来源不合法";
    }
  }
  return null;
}
