// 用途：模型接口地址校验工具：限制协议（https；本机回环允许 http）、禁止 URL 内嵌账号密码；供 keys 接口校验与 Key-端点绑定判断共用。
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function originOf(url: string): string {
  const parsed = new URL(url);
  return parsed.origin;
}

// 返回 null 表示合法；否则返回中文错误提示。
export function baseUrlViolation(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "接口地址格式不正确";
  }
  if (parsed.username !== "" || parsed.password !== "") return "接口地址不能包含账号密码";
  if (parsed.protocol === "https:") return null;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) return null;
  return "接口地址必须是 https（仅本机回环地址允许 http）";
}
