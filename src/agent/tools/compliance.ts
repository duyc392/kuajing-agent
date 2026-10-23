// 用途：合规扫描工具：按本地违禁词库硬扫描文案/口播，标出敏感词、类别、严重级别与替换建议。
// 只扫描与标注，不改写内容；改写由主 Agent 按 SOP 完成后再扫一次。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { scanCompliance } from "@/lib/compliance";
import type { ComplianceScanDetails } from "@/types";

const complianceSchema = Type.Object({
  text: Type.String({ description: "要扫描的文案、口播或屏幕贴字（可多段拼接）", minLength: 1, maxLength: 20000, pattern: "\\S" }),
});

type ComplianceParams = Static<typeof complianceSchema>;

export function createComplianceTool(): AgentTool<typeof complianceSchema, ComplianceScanDetails> {
  return {
    name: "check_tiktok_compliance",
    label: "合规扫描",
    description:
      "按本地违禁词库扫描文案与口播：医疗功效、绝对化用语、侵权品牌、平台违禁品、金融承诺五类，返回命中词、位置、严重级别与替换建议。生成任何要上线的文案/脚本后都应调用；未通过时按建议改写并重新扫描，不得带 high 级风险交付。",
    parameters: complianceSchema,
    async execute(_toolCallId, params: ComplianceParams): Promise<AgentToolResult<ComplianceScanDetails>> {
      const details = scanCompliance(params.text);
      const text = details.passed
        ? `合规扫描通过：未命中违禁词（扫描 ${details.scannedChars} 字符）。`
        : [
            `合规扫描未通过：风险等级 ${details.riskLevel}，命中 ${details.matches.length} 处${details.truncated ? "（已达返回上限）" : ""}。`,
            ...details.matches.map((match) => `- 「${match.term}」（${match.category}/${match.severity}，位置 ${match.index}）：${match.suggestion}`),
            "请按建议改写后重新扫描，high 级命中必须清零。",
          ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}
