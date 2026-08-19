// 用途：图片字节校验工具（图片 API 下载与用户上传共用）：
// 大小上限、魔数（文件头）校验只接受 PNG/JPEG/WebP、MIME 到扩展名映射——保证落盘文件与声明格式一致。
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 单张图片 10MB 上限（防内存/磁盘耗尽）

export type AllowedImageMime = "image/png" | "image/jpeg" | "image/webp";

// 按文件头魔数识别真实图片类型；不认识的一律 null（防止把 HTML/脚本当图片落盘）。
export function detectImageMime(bytes: Buffer): AllowedImageMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// 已校验 MIME → 文件扩展名（不信任 URL 后缀，只按真实字节决定）。
export function extensionOfMime(mime: AllowedImageMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

// 已存文件相对路径 → 推断 MIME（用于把本地参考图回传给图生图接口）。
export function mimeOfExtension(filePath: string): AllowedImageMime {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}
