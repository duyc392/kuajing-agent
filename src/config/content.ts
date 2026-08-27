// 用途：内容运营静态配置：视频类型与各状态白名单（服务层校验、Mock 数据与界面展示共用，不散落硬编码）。
// 与 VideoScript.type 保持同一套类型词表。
export const CONTENT_ANGLES = ["开箱", "教程", "种草", "对比"] as const;

export const PUBLISHED_VIDEO_STATUSES = ["在跑", "停止"] as const;

// 规格 2.6：状态点击循环按「待拍摄 → 拍摄中 → 已归档复用 → 待拍摄」三态切换。
export const SHOT_REQUIREMENT_STATUSES = ["待拍摄", "拍摄中", "已归档复用"] as const;
