// 用途：统一请求体读取：所有写接口用它替代 request.json()——限制总字节数（防内存膨胀）、限制总读取时长（防客户端"声明了但发不完"把连接挂死）。
// 整个读取只创建一个定时器，到点通过取消 reader 让挂起的 read() 结束；finally 统一清除，避免每个分块泄漏一个定时器。
import { AppError, ValidationError } from "@/lib/errors";

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

export async function readJsonBody(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BYTES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, timeoutMs);
  try {
    while (true) {
      if (timedOut) throw new AppError("请求体读取超时，请重试", "BODY_TIMEOUT", 408);
      const result = await reader.read();
      if (timedOut) throw new AppError("请求体读取超时，请重试", "BODY_TIMEOUT", 408);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) throw new AppError("请求体过大（上限 256KB）", "BODY_TOO_LARGE", 413);
      chunks.push(result.value);
    }
    const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf-8");
    try {
      return JSON.parse(text);
    } catch {
      throw new ValidationError("请求体不是合法 JSON");
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
