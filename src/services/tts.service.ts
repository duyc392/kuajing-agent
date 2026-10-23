// 用途：本土化配音服务：调 ElevenLabs 合成音频 → 用字符级对齐生成 SRT → 落盘到 public/generated/tts。
// 不翻译、不改写文案：多语言文案由主 Agent 按分镜 SOP 产出后传入。
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { TTS_DEFAULTS } from "@/config/integrations";
import { readIntegrationsConfig } from "@/lib/integrations-config";
import { synthesizeSpeech } from "@/lib/tts-client";
import { buildSrt } from "@/lib/srt";
import { segmentsFromAlignment } from "@/lib/tts-timeline";
import type { TtsRunDetails } from "@/types";

const OUTPUT_DIR = path.join(process.cwd(), "public", "generated", "tts");

export interface TtsInput {
  text: string;
  language: string;
  voiceId?: string;
  signal?: AbortSignal;
}

export async function generateLocalizedTts(input: TtsInput): Promise<TtsRunDetails> {
  const settings = await readIntegrationsConfig();
  const voiceId = input.voiceId?.trim() || settings.tts.voiceId;
  const result = await synthesizeSpeech({
    settings: { ...settings.tts, voiceId },
    text: input.text,
    timeoutMs: TTS_DEFAULTS.timeoutMs,
    signal: input.signal,
  });
  const id = crypto.randomUUID();
  // 没有对齐数据时用「字符数 / 每秒 15 字符」估算总时长，仅用于字幕均分，不对外声称是实测时长。
  const estimatedDuration = result.alignment ? 0 : Math.max(1, input.text.length / 15);
  const segments = segmentsFromAlignment(result.alignment, estimatedDuration, input.text);
  const durationSeconds = segments.length > 0 ? Number(segments[segments.length - 1].end.toFixed(2)) : 0;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const audioDiskPath = path.join(OUTPUT_DIR, `${id}.mp3`);
  const srtDiskPath = path.join(OUTPUT_DIR, `${id}.srt`);
  await fs.writeFile(audioDiskPath, result.audio);
  await fs.writeFile(srtDiskPath, buildSrt(segments), "utf8");
  return {
    language: input.language,
    voiceId,
    audioPublicPath: `/generated/tts/${id}.mp3`,
    audioDiskPath,
    srtPublicPath: `/generated/tts/${id}.srt`,
    srtDiskPath,
    durationSeconds,
  };
}
