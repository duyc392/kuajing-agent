// 用途：外部集成默认配置（固定出图工作流 / TTS / 飞书 / Notion）与媒体处理参数。
// 生图统一走 KeysConfig 的 image 分组（apiKey/baseUrl/model）：自由出图与固定工作流共用同一个模型与接口。
export const IMAGE_WORKFLOW_DEFAULTS = {
  /** 单次工作流最多出几张，避免一次调用把 Agent 回合拖死 */
  maxImages: 4,
  /** 单次出图的时间预算（毫秒），超预算如实返回未完成数量 */
  budgetMs: 100_000,
};

export const TTS_DEFAULTS = {
  baseUrl: "https://api.elevenlabs.io/v1",
  modelId: "eleven_multilingual_v2",
  /** 缺省音色：多语言通用女声，卖家可在 config 覆盖 */
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  timeoutMs: 120_000,
};

export const FEISHU_DEFAULTS = {
  baseUrl: "https://open.feishu.cn",
  timeoutMs: 30_000,
};

export const NOTION_DEFAULTS = {
  baseUrl: "https://api.notion.com",
  version: "2022-06-28",
  timeoutMs: 30_000,
};

export const MEDIA_DEFAULTS = {
  /** yt-dlp 下载超时 */
  downloadTimeoutMs: 180_000,
  /** whisper 转写超时（含模型加载） */
  transcribeTimeoutMs: 300_000,
  /** ffmpeg 抽帧超时 */
  frameTimeoutMs: 180_000,
  /** 场景切换检测阈值（0-1），越大切点越少 */
  sceneThreshold: 0.3,
  /** 单个视频文件大小上限（500MB），防止误传超大文件拖垮本机 */
  maxVideoBytes: 500 * 1024 * 1024,
  /** 允许解析的视频域名（TikTok 系）；其他域名直接拒绝 */
  allowedHosts: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"],
};

export const ASYNC_TASK_DEFAULTS = {
  /** 任务结果保留时长：超时清理，避免内存无限增长 */
  ttlMs: 30 * 60 * 1000,
};
