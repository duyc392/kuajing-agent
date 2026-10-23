// 用途：SRT 字幕生成（纯函数）：把带时间戳的文本片段转成标准 SRT 文本。
// 时间格式固定 HH:MM:SS,mmm，序号从 1 连续；空文本片段跳过，避免生成空字幕条目。
import type { TranscriptSegment } from "@/types";

function pad(value: number, width: number): string {
  return String(Math.floor(value)).padStart(width, "0");
}

export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(millis, 3)}`;
}

export function buildSrt(segments: TranscriptSegment[]): string {
  const usable = segments.filter((segment) => segment.text.trim() !== "");
  return usable
    .map((segment, index) => `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text.trim()}`)
    .join("\n\n")
    .concat("\n");
}
