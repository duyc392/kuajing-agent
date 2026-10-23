// 用途：竞品视频解析服务：下载 → 转写 → 抽帧 → 切镜节奏，四个动作各自独立（对应四个原子工具），
// 产物统一存放在 public/generated/video/<assetId>/ 下，并用 meta.json 记录来源与时长。
// 本服务只做确定性的媒体处理，不判断内容好坏；拆解结论由主 Agent 按 SOP 完成。
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MEDIA_DEFAULTS } from "@/config/integrations";
import { AppError, NotFoundError } from "@/lib/errors";
import { runBinary, runBinaryRaw, assertAllowedVideoUrl } from "@/lib/media-tools";
import { buildSrt } from "@/lib/srt";
import { computeCutRhythm } from "@/lib/video-metrics";
import type {
  CutRhythmDetails,
  KeyframeDetails,
  TranscriptDetails,
  TranscriptSegment,
  VideoAssetDetails,
} from "@/types";
const VIDEO_ROOT = path.join(process.cwd(), "public", "generated", "video");
const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_FRAME_INTERVAL = 2;

export interface VideoMeta {
  videoUrl: string;
  durationSeconds: number | null;
  bytes: number;
  language: string | null;
}

// assetId 必须是 UUID：防止把任意字符串拼进文件路径（目录穿越）。
export function assertAssetId(assetId: string): string {
  if (!ASSET_ID_PATTERN.test(assetId)) throw new AppError("视频素材 ID 不合法", "INVALID_ASSET_ID", 400);
  return assetId;
}

function assetDir(assetId: string): string {
  return path.join(VIDEO_ROOT, assertAssetId(assetId));
}

function sourcePath(assetId: string): string {
  return path.join(assetDir(assetId), "source.mp4");
}

async function readMeta(assetId: string): Promise<VideoMeta> {
  try {
    const raw = await fs.readFile(path.join(assetDir(assetId), "meta.json"), "utf8");
    return JSON.parse(raw) as VideoMeta;
  } catch {
    throw new NotFoundError("视频素材不存在或已清理，请重新下载");
  }
}

// 从 ffmpeg -i 的 stderr 解析时长（ffmpeg 读元信息时以 1 退出，不能按失败处理）。
function parseDuration(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function probeDuration(filePath: string, signal?: AbortSignal): Promise<number | null> {
  const result = await runBinaryRaw("ffmpeg", ["-hide_banner", "-i", filePath], { timeoutMs: 30_000, signal });
  return parseDuration(result.stderr);
}

// 下载：yt-dlp 直出 mp4，随后探测时长与文件大小并落 meta.json。
export async function downloadVideo(params: { videoUrl: string; signal?: AbortSignal }): Promise<VideoAssetDetails> {
  assertAllowedVideoUrl(params.videoUrl, MEDIA_DEFAULTS.allowedHosts);
  const assetId = randomUUID();
  const dir = assetDir(assetId);
  await fs.mkdir(dir, { recursive: true });
  const target = sourcePath(assetId);
  await runBinary("yt-dlp", [
    "--no-playlist",
    "--no-warnings",
    "-f", "best[ext=mp4]/best",
    "-o", target,
    params.videoUrl,
  ], { timeoutMs: MEDIA_DEFAULTS.downloadTimeoutMs, signal: params.signal });
  const stat = await fs.stat(target);
  if (stat.size > MEDIA_DEFAULTS.maxVideoBytes) {
    await fs.rm(dir, { recursive: true, force: true });
    throw new AppError(`视频文件超过 ${Math.round(MEDIA_DEFAULTS.maxVideoBytes / 1024 / 1024)}MB 上限，请换更短的素材`, "VIDEO_TOO_LARGE", 400);
  }
  const durationSeconds = await probeDuration(target, params.signal);
  const meta: VideoMeta = { videoUrl: params.videoUrl, durationSeconds, bytes: stat.size, language: null };
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return {
    assetId,
    videoUrl: params.videoUrl,
    diskPath: target,
    publicPath: `/generated/video/${assetId}/source.mp4`,
    durationSeconds,
    bytes: stat.size,
  };
}

interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
}

// 转写：whisper 输出 JSON（含 start/end/text），再生成 SRT；覆盖率 = 最后一句结束时间 / 视频时长。
export async function transcribeVideo(params: { assetId: string; language?: string; signal?: AbortSignal }): Promise<TranscriptDetails> {
  const assetId = assertAssetId(params.assetId);
  const meta = await readMeta(assetId);
  const dir = assetDir(assetId);
  await runBinary("whisper", [
    sourcePath(assetId),
    "--model", process.env.WHISPER_MODEL || "small",
    "--output_format", "json",
    "--output_dir", dir,
    "--task", "transcribe",
    ...(params.language ? ["--language", params.language] : []),
  ], { timeoutMs: MEDIA_DEFAULTS.transcribeTimeoutMs, signal: params.signal });
  const jsonPath = path.join(dir, "source.json");
  let parsed: { text?: string; language?: string; segments?: WhisperSegment[] };
  try {
    parsed = JSON.parse(await fs.readFile(jsonPath, "utf8")) as typeof parsed;
  } catch (error) {
    console.error("[video] whisper 输出解析失败:", error);
    throw new AppError("语音转写结果无法解析，请重试", "TRANSCRIBE_PARSE", 502);
  }
  const segments: TranscriptSegment[] = (parsed.segments ?? [])
    .map((segment) => ({ start: Number(segment.start ?? 0), end: Number(segment.end ?? 0), text: (segment.text ?? "").trim() }))
    .filter((segment) => segment.text !== "");
  if (segments.length === 0) throw new AppError("没有识别到语音内容，可能是纯 BGM 视频", "TRANSCRIBE_EMPTY", 422);
  const srtPath = path.join(dir, "transcript.srt");
  await fs.writeFile(srtPath, buildSrt(segments), "utf8");
  const lastEnd = segments[segments.length - 1].end;
  const duration = meta.durationSeconds ?? lastEnd;
  return {
    assetId,
    language: parsed.language ?? params.language ?? null,
    segments,
    fullText: segments.map((segment) => segment.text).join(" "),
    coverage: duration > 0 ? Number(Math.min(1, lastEnd / duration).toFixed(3)) : 0,
    srtPath: `/generated/video/${assetId}/transcript.srt`,
  };
}

// 抽帧：按固定间隔（默认 2 秒）截关键帧，文件名 0001.jpg 起。
export async function extractVideoFrames(params: { assetId: string; intervalSeconds?: number; signal?: AbortSignal }): Promise<KeyframeDetails> {
  const assetId = assertAssetId(params.assetId);
  await readMeta(assetId);
  const interval = Math.min(Math.max(params.intervalSeconds ?? DEFAULT_FRAME_INTERVAL, 1), 10);
  const dir = assetDir(assetId);
  const framesDir = path.join(dir, "frames");
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  await runBinary("ffmpeg", [
    "-hide_banner", "-y",
    "-i", sourcePath(assetId),
    "-vf", `fps=1/${interval}`,
    "-q:v", "3",
    path.join(framesDir, "%04d.jpg"),
  ], { timeoutMs: MEDIA_DEFAULTS.frameTimeoutMs, signal: params.signal });
  const files = (await fs.readdir(framesDir)).filter((name) => name.endsWith(".jpg")).sort();
  return {
    assetId,
    intervalSeconds: interval,
    frames: files.map((name, index) => ({
      timeSeconds: index * interval,
      publicPath: `/generated/video/${assetId}/frames/${name}`,
      diskPath: path.join(framesDir, name),
    })),
  };
}

// 切镜检测：ffmpeg scene 滤镜把切点打在 stderr 的 pts_time 上，再交给纯函数算节奏指标。
export async function computeVideoRhythm(params: { assetId: string; signal?: AbortSignal }): Promise<CutRhythmDetails> {
  const assetId = assertAssetId(params.assetId);
  const meta = await readMeta(assetId);
  const result = await runBinaryRaw("ffmpeg", [
    "-hide_banner",
    "-i", sourcePath(assetId),
    "-filter:v", `select='gt(scene,${MEDIA_DEFAULTS.sceneThreshold})',showinfo`,
    "-f", "null", "-",
  ], { timeoutMs: MEDIA_DEFAULTS.frameTimeoutMs, signal: params.signal });
  const cuts = [...result.stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  const durationSeconds = meta.durationSeconds ?? (cuts.length > 0 ? cuts[cuts.length - 1] : 0);
  const metrics = computeCutRhythm({ durationSeconds, cuts });
  return { assetId, ...metrics };
}
