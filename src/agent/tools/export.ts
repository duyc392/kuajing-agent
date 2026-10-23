// 用途：SOP 归档工具：把已确认的选品报告 / 分镜 / 脚本写入飞书多维表格或 Notion 数据库。
// 只做字段映射与写入，不生成内容；凭据从 data/config.json 或环境变量读取，未配置时给中文引导。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { exportToIntegration } from "@/services/integration-export.service";
import { EXPORT_RESOURCES, type ExportResultDetails } from "@/types";

const exportSchema = Type.Object({
  provider: Type.Union([Type.Literal("feishu"), Type.Literal("notion")], { description: "归档目标：飞书多维表格 / Notion 数据库" }),
  resource: Type.Union(EXPORT_RESOURCES.map((item) => Type.Literal(item)), {
    description: "归档内容类型：selection-report 选品报告 / storyboard 分镜 / script 脚本",
  }),
  title: Type.String({ description: "记录标题（建议含商品名与日期）", minLength: 1, maxLength: 200, pattern: "\\S" }),
  payload: Type.String({ description: "要归档的 JSON 对象文本，顶层键会成为表格字段", minLength: 2, maxLength: 100000 }),
});

type ExportParams = Static<typeof exportSchema>;

export function createExportTool(): AgentTool<typeof exportSchema, ExportResultDetails> {
  return {
    name: "export_to_feishu_or_notion",
    label: "归档到飞书/Notion",
    description:
      "把卖家已确认的报告、分镜或脚本一键写入团队飞书多维表格或 Notion 数据库，返回记录链接。卖家要求归档、同步到飞书/Notion、交付给团队时调用；payload 传结构化 JSON 对象，不要传自然语言长文。",
    parameters: exportSchema,
    async execute(_toolCallId, params: ExportParams): Promise<AgentToolResult<ExportResultDetails>> {
      const details = await exportToIntegration({
        provider: params.provider,
        resource: params.resource,
        title: params.title.trim(),
        payload: params.payload,
      });
      const text = `已归档到${details.provider === "feishu" ? "飞书多维表格" : "Notion"}（${details.fieldCount} 个字段）${details.url ? `：${details.url}` : ""}。`;
      return { content: [{ type: "text", text }], details };
    },
  };
}
