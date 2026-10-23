// 用途：ElevenLabs 语音合成客户端：调用 with-timestamps 接口，返回音频字节 + 字符级时间轴。
// 只做协议对接；字幕分段由 lib/tts-timeline 的纯函数从字符时间轴推导。
import { AppError } from "@/lib/errors";

export interface TtsSettingsInput {
  apiKey: string;
  baseUrl: string;
  voiceId: string;
  modelId: string;
}

export interface TtsAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface TtsResult {
  audio: Buffer;
  mimeType: string;
  alignment: TtsAlignment | null;
}

function baseOf(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function statusError(status: number): AppError {
  if (status === 401) return new AppError("TTS API Key 无效，请检查配置", "TTS_AUTH", 502);
  if (status === 429) return new AppError("TTS 请求过于频繁或额度不足，请稍后重试", "TTS_QUOTA", 429);
  return new AppError(`语音合成服务返回错误（HTTP ${status}），请稍后重试`, "TTS_ERROR", 502);
}

// 合成：output_format 固定 mp3_44100_128，便于后续混剪直接使用。
export async function synthesizeSpeech(params: {
  settings: TtsSettingsInput;
  text: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TtsResult> {
  if (params.settings.apiKey.trim() === "") {
    throw new AppError("尚未配置 ElevenLabs API Key，请先在 data/config.json 的 tts 分组或环境变量 ELEVENLABS_API_KEY 中配置", "TTS_NOT_CONFIGURED", 501);
  }
  const url = `${baseOf(params.settings.baseUrl)}/text-to-speech/${encodeURIComponent(params.settings.voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  const onAbort = () => controller.abort(params.signal?.reason);
  params.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": params.settings.apiKey },
        body: JSON.stringify({
          text: params.text,
          model_id: params.settings.modelId,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted && !params.signal?.aborted) {
        throw new AppError("语音合成超时，请缩短文案后重试", "TTS_TIMEOUT", 504);
      }
      throw new AppError("无法连接语音合成服务，请检查网络后重试", "TTS_NETWORK", 502);
    }
    if (!response.ok) throw statusError(response.status);
    const body = (await response.json()) as { audio_base64?: unknown; alignment?: unknown };
    if (typeof body.audio_base64 !== "string" || body.audio_base64 === "") {
      throw new AppError("语音合成服务没有返回音频，请重试", "TTS_EMPTY", 502);
    }
    return { audio: Buffer.from(body.audio_base64, "base64"), mimeType: "audio/mpeg", alignment: parseAlignment(body.alignment) };
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener("abort", onAbort);
  }
}

function parseAlignment(raw: unknown): TtsAlignment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const characters = value.characters;
  const starts = value.character_start_times_seconds;
  const ends = value.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return null;
  if (characters.length !== starts.length || characters.length !== ends.length) return null;
  return {
    characters: characters.filter((item): item is string => typeof item === "string"),
    characterStartTimesSeconds: starts.filter((item): item is number => typeof item === "number"),
    characterEndTimesSeconds: ends.filter((item): item is number => typeof item === "number"),
  };
}
