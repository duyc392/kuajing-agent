// 用途：报告卡投影校验（纯函数，无 IO）：把主 Agent 提交的报告字段做结构校验并收敛成长度合理的视图对象。
// present_report 工具用它兜住格式，缺字段直接报中文错误让模型重交；这里不产生任何业务判断。
import { ValidationError } from "@/lib/errors";
import type { CompetitorDetails, MarketAnalysisDetails, RecommendationDetails, ReportPresentation } from "@/types";

function text(value: unknown, field: string, max = 800): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`报告字段「${field}」不能为空`);
  return value.trim().slice(0, max);
}

function marketCard(data: Record<string, unknown>): MarketAnalysisDetails {
  const highlights = Array.isArray(data.dataHighlights)
    ? data.dataHighlights.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 6)
    : [];
  return {
    market: text(data.market, "market", 50),
    category: text(data.category, "category", 200),
    capacity: text(data.capacity, "capacity"),
    competition: text(data.competition, "competition"),
    growth: text(data.growth, "growth"),
    profit: text(data.profit, "profit"),
    dataHighlights: highlights,
  };
}

function recommendationCard(data: Record<string, unknown>): RecommendationDetails {
  const raw = Array.isArray(data.recommendations) ? data.recommendations : [];
  const recommendations = raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      direction: text(item.direction, "recommendations.direction", 200),
      dataSupport: text(item.dataSupport, "recommendations.dataSupport"),
      reason: text(item.reason, "recommendations.reason"),
    }))
    .slice(0, 3);
  if (recommendations.length === 0) throw new ValidationError("选品推荐至少要有一个方向（direction/dataSupport/reason 齐全）");
  return { market: text(data.market, "market", 50), recommendations };
}

function competitorCard(data: Record<string, unknown>): CompetitorDetails {
  return {
    shopName: text(data.shopName, "shopName", 200),
    pricing: text(data.pricing, "pricing"),
    contentStyle: text(data.contentStyle, "contentStyle"),
    listingFrequency: text(data.listingFrequency, "listingFrequency"),
    trafficStructure: text(data.trafficStructure, "trafficStructure"),
    comparison: text(data.comparison, "comparison"),
    differentiation: text(data.differentiation, "differentiation"),
  };
}

export function validateReportPresentation(kind: ReportPresentation["kind"], data: Record<string, unknown>): ReportPresentation {
  if (kind === "market") return { kind, data: marketCard(data) };
  if (kind === "recommendation") return { kind, data: recommendationCard(data) };
  return { kind, data: competitorCard(data) };
}
