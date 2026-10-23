// 用途：竞品视频解析工具：下载、转写、抽帧、算切镜节奏，每个工具只做一件事。
// 下载/转写/抽帧耗时长，走异步任务（返回 taskId，用 get_async_task 轮询），避免阻塞对话回合。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { startTask } from "@/services/async-task.service";
import { computeVideoRhythm, downloadVideo, extractVideoFrames, transcribeVideo } from "@/services/competitor-video.service";
import type { AsyncTaskHandleDetails, CutRhythmDetails, KeyframeDetails, TranscriptDetails, VideoAssetDetails } from "@/types";

const sourceSchema = Type.Object({
  videoUrl: Type.String({ description: "TikTok 视频完整链接（https）", minLength: 12, maxLength: 500, pattern: "\\S" }),
});

const assetSchema = Type.Object({
  assetId: Type.String({
    description: "fetch_video_source 返回的素材 ID（UUID）",
    minLength: 36,
    maxLength: 36,
    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
  }),
});

const transcribeSchema = Type.Object({
  assetId: assetSchema.properties.assetId,
  language: Type.Optional(Type.String({ description: "口播语言代码（如 en / id）；不确定就省略，自动识别", minLength: 2, maxLength: 8 })),
});

const framesSchema = Type.Object({
  assetId: assetSchema.properties.assetId,
  intervalSeconds: Type.Optional(Type.Integer({ description: "每隔几秒截一帧，默认 2，范围 1-10", minimum: 1, maximum: 10 })),
});

type SourceParams = Static<typeof sourceSchema>;
type TranscribeParams = Static<typeof transcribeSchema>;
type FramesParams = Static<typeof framesSchema>;
type AssetParams = Static<typeof assetSchema>;

function taskResult(kind: string, taskId: string, hint: string): AgentToolResult<AsyncTaskHandleDetails> {
  return {
    content: [{ type: "text", text: `已开始${kind}（任务 ${taskId}）。${hint}` }],
    details: { taskId, kind, status: "running" },
  };
}

export function createFetchVideoSourceTool(): AgentTool<typeof sourceSchema, AsyncTaskHandleDetails> {
  return {
    name: "fetch_video_source",
    label: "下载竞品视频",
    description:
      "下载 TikTok 视频到本地素材库，返回 taskId。完成后用 get_async_task 取 assetId 与时长，再依次调用 transcribe_video、extract_video_frames。只支持 TikTok 域名，单文件上限 500MB。",
    parameters: sourceSchema,
    async execute(_toolCallId, params: SourceParams): Promise<AgentToolResult<AsyncTaskHandleDetails>> {
      const { taskId } = startTask<VideoAssetDetails>("video-source", () => downloadVideo({ videoUrl: params.videoUrl.trim() }));
      return taskResult("下载", taskId, "通常 10-60 秒，请稍后调用 get_async_task 查询结果。");
    },
  };
}

export function createTranscribeVideoTool(): AgentTool<typeof transcribeSchema, AsyncTaskHandleDetails> {
  return {
    name: "transcribe_video",
    label: "视频语音转写",
    description:
      "对已下载的视频做语音转写，返回带时间戳的逐字稿与 SRT，供拆解引用原文。返回 taskId，用 get_async_task 取结果。纯 BGM 无口播时会报错，如实反馈即可。",
    parameters: transcribeSchema,
    async execute(_toolCallId, params: TranscribeParams): Promise<AgentToolResult<AsyncTaskHandleDetails>> {
      const { taskId } = startTask<TranscriptDetails>("transcribe", () => transcribeVideo({ assetId: params.assetId, language: params.language }));
      return taskResult("语音转写", taskId, "通常 30-120 秒，请稍后调用 get_async_task 查询。");
    },
  };
}

export function createExtractFramesTool(): AgentTool<typeof framesSchema, AsyncTaskHandleDetails> {
  return {
    name: "extract_video_frames",
    label: "视频抽关键帧",
    description:
      "按固定间隔（默认 2 秒）从已下载的视频截取关键帧画面，返回图片路径供多模态解读。返回 taskId，用 get_async_task 取结果。",
    parameters: framesSchema,
    async execute(_toolCallId, params: FramesParams): Promise<AgentToolResult<AsyncTaskHandleDetails>> {
      const { taskId } = startTask<KeyframeDetails>("extract-frames", () =>
        extractVideoFrames({ assetId: params.assetId, intervalSeconds: params.intervalSeconds }));
      return taskResult("抽帧", taskId, "通常 10-30 秒，请稍后调用 get_async_task 查询。");
    },
  };
}

export function createCutRhythmTool(): AgentTool<typeof assetSchema, CutRhythmDetails> {
  return {
    name: "compute_cut_rhythm",
    label: "计算切镜节奏",
    description:
      "用场景切换检测算出视频的切点、切镜数、每 10 秒切镜数、最长与平均镜头长度。节奏数字只能引用本工具结果，不要自己数关键帧估算。",
    parameters: assetSchema,
    async execute(_toolCallId, params: AssetParams, signal?: AbortSignal): Promise<AgentToolResult<CutRhythmDetails>> {
      const details = await computeVideoRhythm({ assetId: params.assetId, signal });
      const text = [
        `切镜节奏：时长 ${details.durationSeconds} 秒，切点 ${details.cutCount} 个，每 10 秒 ${details.cutsPerTenSeconds} 次切换，`,
        `平均镜头 ${details.averageShotSeconds} 秒，最长镜头 ${details.longestShotSeconds} 秒。`,
        "引用这些数字时要注明来自场景切换检测。",
      ].join("");
      return { content: [{ type: "text", text }], details };
    },
  };
}
