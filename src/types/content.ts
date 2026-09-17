// 用途：内容运营业务域类型（爆款内容拆解、已发布视频、视频复盘、素材需求；商品 DNA 的类型在 product.ts）：
// 视图契约带 shopId（隔离铁律）；JSON 文本字段（留存、建议、脚本 ID）在视图里以解析后的数组暴露。
// 联合类型由 config/content.ts 白名单推导（P18：编译期词表保护，禁止散落字符串字面量）。
import type { CONTENT_ANGLES, PUBLISHED_VIDEO_STATUSES, SHOT_REQUIREMENT_STATUSES } from "@/config/content";

export type ContentAngle = (typeof CONTENT_ANGLES)[number];
export type PublishedVideoStatus = (typeof PUBLISHED_VIDEO_STATUSES)[number];
export type ShotRequirementStatus = (typeof SHOT_REQUIREMENT_STATUSES)[number];

export interface ContentReferenceView {
  id: string;
  shopId: string;
  productId: string;
  sourceVideoId: string | null;
  sourceUrl: string | null;
  title: string;
  angle: ContentAngle;
  playCount: number;
  conversionRate: number | null;
  completionRate: number | null;
  hook: string;
  sellingPoint: string | null;
  highFrequencyQuestion: string | null;
  cta: string;
  collectedAt: string;
  createdAt: string;
}

export interface PublishedVideoView {
  id: string;
  shopId: string;
  productId: string;
  /** 数据来源标记：demo = 演示数据（内容运营数据源当前为 Mock），real = 真实采集；页面据此显示"演示数据"标注。 */
  source: "demo" | "real";
  scriptId: string | null;
  platformVideoId: string | null;
  title: string;
  angle: ContentAngle;
  durationSeconds: number;
  playCount: number;
  orderCount: number;
  gmv: number;
  completionRate: number | null;
  status: PublishedVideoStatus;
  retentionData: number[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoReviewView {
  id: string;
  shopId: string;
  publishedVideoId: string;
  /** 数据来源标记：demo = 演示数据（内容运营数据源当前为 Mock），real = 真实采集；页面据此显示"演示数据"标注。 */
  source: "demo" | "real";
  dropPointSeconds: number | null;
  dropRate: number | null;
  summary: string;
  suggestions: string[];
  generatedScriptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShotRequirementView {
  id: string;
  shopId: string;
  productId: string;
  shotCode: string;
  scene: string;
  actionDescription: string;
  propsAndLighting: string;
  scriptIds: string[];
  status: ShotRequirementStatus;
  createdAt: string;
  updatedAt: string;
}
