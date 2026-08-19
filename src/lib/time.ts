// 用途：时间显示工具：把 ISO 时间字符串转为中文相对时间（侧边栏"最后活跃时间"等场景使用）。
export function formatRelativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN");
}

// 直播脚本时长显示：数据库存秒，界面按分钟展示（各阶段分钟数总和 × 60 = 秒数，恒为整数分钟）。
export function formatMinutes(totalSeconds: number): string {
  return `${Math.round(totalSeconds / 60)} 分钟`;
}
