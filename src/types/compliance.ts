// 用途：平台合规扫描域类型：违禁词/绝对化用语/医疗功效/侵权品牌/金融承诺的命中项与扫描结果。
// 扫描是确定性正则匹配（lib/compliance），工具只标注风险与替换建议，不改写文案。

export const CHECK_COMPLIANCE_TOOL_NAME = "check_tiktok_compliance";

export type ComplianceSeverity = "high" | "medium" | "low";

export type ComplianceCategory = "medical" | "absolute" | "brand" | "platform" | "finance";

export interface ComplianceMatch {
  term: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  /** 在原文中的起始下标（0 起） */
  index: number;
  suggestion: string;
}

export interface ComplianceScanDetails {
  passed: boolean;
  riskLevel: ComplianceSeverity | "none";
  scannedChars: number;
  matches: ComplianceMatch[];
  truncated: boolean;
}
