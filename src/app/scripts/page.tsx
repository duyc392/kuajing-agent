// 用途：脚本列表已并入「内容创作」页脚本库（③），旧 /scripts 入口重定向。
import { redirect } from "next/navigation";

export default function ScriptsPage() {
  redirect("/content");
}
