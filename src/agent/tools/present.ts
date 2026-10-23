// 用途：报告卡投影工具：把主 Agent 得出的结论提交为前端结构化卡片。
// 它不做任何业务判断，只做字段校验与长度收敛；结论本身由主 Agent 按 SOP 产出。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { validateReportPresentation } from "@/lib/report-validation";
import { PRESENT_REPORT_TOOL_NAME, type ReportPresentation } from "@/types";

const presentSchema = Type.Object({
  kind: Type.Union([Type.Literal("market"), Type.Literal("recommendation"), Type.Literal("competitor")], {
    description: "报告类型：market 市场分析 / recommendation 选品方向 / competitor 竞品拆解",
  }),
  data: Type.Record(Type.String(), Type.Unknown(), {
    description:
      "报告字段。market 需要 market/category/capacity/competition/growth/profit/dataHighlights；recommendation 需要 market/recommendations[{direction,dataSupport,reason}]；competitor 需要 shopName/pricing/contentStyle/listingFrequency/trafficStructure/comparison/differentiation",
  }),
});

type PresentParams = Static<typeof presentSchema>;

const TITLES: Record<ReportPresentation["kind"], string> = {
  market: "市场分析报告卡",
  recommendation: "选品方向报告卡",
  competitor: "竞品拆解报告卡",
};

export function createPresentReportTool(): AgentTool<typeof presentSchema, ReportPresentation> {
  return {
    name: PRESENT_REPORT_TOOL_NAME,
    label: "提交报告卡",
    description:
      "把已经分析好的结论提交成前端报告卡（市场分析 / 选品方向 / 竞品拆解）。只做字段校验，不生成内容：字段缺失会报错让你补齐。分析结论写完正文后调用它，卖家才能看到结构化卡片。",
    parameters: presentSchema,
    async execute(_toolCallId, params: PresentParams): Promise<AgentToolResult<ReportPresentation>> {
      const presentation = validateReportPresentation(params.kind, params.data);
      return {
        content: [{ type: "text", text: `${TITLES[params.kind]}已生成并展示给卖家。` }],
        details: presentation,
      };
    },
  };
}
