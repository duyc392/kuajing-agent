// 用途：本机访问守卫：校验请求的 Host 与 Origin 只允许本机回环地址，且 Origin 的协议+主机+端口必须与 Host 完全一致，
// 拦截局域网设备、其他本地端口的跨站伪造与 DNS 重绑定攻击。
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostAndPort(value: string): { hostname: string; port: string } {
  const host = value.trim().toLowerCase();
  const match = host.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!match) return { hostname: host.replace(/:\d+$/, ""), port: "" };
  return { hostname: match[1], port: match[2] ?? "" };
}

export function localRequestViolation(host: string | null, origin: string | null): string | null {
  const hostInfo = hostAndPort(host ?? "");
  if (!LOCAL_HOSTNAMES.has(hostInfo.hostname)) return "禁止访问：本服务只允许本机使用";
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return "禁止访问：请求来源不合法";
  }
  if (!LOCAL_HOSTNAMES.has(parsed.hostname)) return "禁止访问：不允许跨站请求";
  // Origin 端口必须与 Host 端口一致：来自 http://localhost:9999 的跨源请求一律拒绝。
  if (parsed.port !== hostInfo.port) return "禁止访问：不允许跨站请求";
  return null;
}
