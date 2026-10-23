// 用途：TTS 时间轴 → 字幕片段（纯函数）：把字符级对齐结果按标点与停顿切成分句，供 SRT 使用。
// 没有对齐数据时按标点切句 + 按字符数比例分配时长，保证仍能产出可用字幕。
import type { TranscriptSegment } from "@/types";
import type { TtsAlignment } from "@/lib/tts-client";

const BREAK_CHARS = new Set(["。", "！", "？", "；", ".", "!", "?", ";", "\n"]);
const MAX_SEGMENT_SECONDS = 8;

function joinChars(chars: string[]): string {
  return chars.join("").replace(/\s+/g, " ").trim();
}

// 按标点切句；没有标点时按最长 8 秒强行切分，避免一整条字幕糊满屏幕。
function fromAlignment(alignment: TtsAlignment): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let buffer: string[] = [];
  let start = alignment.characterStartTimesSeconds[0] ?? 0;
  for (let index = 0; index < alignment.characters.length; index += 1) {
    const char = alignment.characters[index];
    buffer.push(char);
    const endTime = alignment.characterEndTimesSeconds[index] ?? start;
    if (BREAK_CHARS.has(char) || endTime - start >= MAX_SEGMENT_SECONDS) {
      const text = joinChars(buffer);
      if (text !== "") segments.push({ start, end: endTime, text });
      buffer = [];
      start = alignment.characterStartTimesSeconds[index + 1] ?? endTime;
    }
  }
  const tail = joinChars(buffer);
  const lastEnd = alignment.characterEndTimesSeconds[alignment.characterEndTimesSeconds.length - 1] ?? start;
  if (tail !== "") segments.push({ start, end: lastEnd, text: tail });
  return segments;
}

// 无对齐数据时的退化方案：按标点切句，再按字符数比例把总时长分配给各句。
function fromText(text: string, duration: number): TranscriptSegment[] {
  const chunks = text
    .split(/[。！？；.!?;\n]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== "");
  if (chunks.length === 0) return [];
  const total = duration > 0 ? duration : chunks.length;
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let cursor = 0;
  return chunks.map((chunk) => {
    const span = (chunk.length / totalChars) * total;
    const segment: TranscriptSegment = { start: Number(cursor.toFixed(2)), end: Number((cursor + span).toFixed(2)), text: chunk };
    cursor += span;
    return segment;
  });
}

export function segmentsFromAlignment(alignment: TtsAlignment | null, duration: number, text: string): TranscriptSegment[] {
  const segments = alignment ? fromAlignment(alignment) : [];
  return segments.length > 0 ? segments : fromText(text, duration);
}
