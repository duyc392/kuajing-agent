// 用途：工作流快照域类型：阶段快照的存取契约（选品/视频拆解/痛点提炼/分镜/脚本/归档）。
// 快照只做序列化存取，不解释 payload 内容；局部重做由主 Agent 读取上一版后自己改写。

export const SAVE_SNAPSHOT_TOOL_NAME = "save_snapshot";
export const LOAD_SNAPSHOT_TOOL_NAME = "load_snapshot";
export const LIST_SNAPSHOTS_TOOL_NAME = "list_snapshots";

export const SNAPSHOT_STAGES = [
  "selection",
  "video-deconstruction",
  "audience-insights",
  "storyboard",
  "script",
  "archive",
] as const;

export type SnapshotStage = (typeof SNAPSHOT_STAGES)[number];

export const SNAPSHOT_PAYLOAD_MAX = 200_000;

export interface SnapshotSaveDetails {
  snapshotId: string;
  stage: SnapshotStage;
  version: number;
  createdAt: string;
}

export interface SnapshotLoadDetails {
  snapshotId: string;
  stage: SnapshotStage;
  version: number;
  payload: string;
  createdAt: string;
  /** 取上一版回滚时为 true（局部重做用） */
  rolledBack: boolean;
}

export interface SnapshotSummary {
  snapshotId: string;
  stage: SnapshotStage;
  version: number;
  createdAt: string;
  payloadChars: number;
}

export interface SnapshotListDetails {
  stage: SnapshotStage | null;
  snapshots: SnapshotSummary[];
}
