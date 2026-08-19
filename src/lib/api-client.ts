// 用途：前端统一请求封装 apiRequest<T>：所有组件与页面经它调用 /api/*，统一处理错误提示、JSON 解析、超时与取消，禁止在组件里裸写 fetch。
const TIMEOUT_MS = 15000;

export async function apiRequest<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort);
  try {
    const response = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      // 200 但响应体不是合法 JSON（如网关错误页）：直接报错，绝不把 {} 当成功结果交给组件去 map。
      throw new Error("服务响应异常，请稍后重试");
    }
    if (!response.ok) {
      const message = (data as { error?: string }).error ?? "请求失败，请稍后重试";
      throw new Error(message);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // 外层调用方主动取消（如切换店铺）：原样抛回，由调用方的 stale 标记决定是否展示错误。
      if (signal?.aborted) throw error;
      throw new Error(timedOut ? "请求超时，请重试" : "请求已取消，请重试");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
