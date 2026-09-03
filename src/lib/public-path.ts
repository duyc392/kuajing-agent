// 用途：把 "/generated/xxx.png" 形式的图片相对路径安全解析为 public 目录内的磁盘绝对路径。
// 防御纵深：图片档案记录若被篡改成 "../../" 等穿越形态，解析结果落在 public 目录之外时返回 null，
// 调用方按"文件不存在"处理——删除档案记录不受影响，但绝不触碰 public 之外的任何文件。
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

// 返回 null 表示路径不合法（穿越出 public 目录或为空），调用方跳过文件操作即可。
export function resolvePublicDiskPath(relativePath: string): string | null {
  const clean = relativePath.replace(/^\/+/, "");
  if (clean === "" || clean.includes("\0")) return null;
  const resolved = path.resolve(PUBLIC_DIR, clean);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) return null;
  return resolved;
}
