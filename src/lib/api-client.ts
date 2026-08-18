// 用途：前端统一请求封装 apiRequest<T>：所有组件与页面经它调用 /api/*，统一处理错误提示与 JSON 解析，禁止在组件里裸写 fetch。
export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: string }).error ?? "请求失败，请稍后重试";
    throw new Error(message);
  }
  return data as T;
}
