// 用途：平台合规扫描（纯函数，无 IO）：按 config/compliance 的正则词库扫描文案/口播，标注命中位置、类别、严重级别与替换建议。
// 只收集风险点，不改写原文；白名单短语先按等长掩码剔除，保证命中下标仍对应原文。
import { COMPLIANCE_MAX_MATCHES, COMPLIANCE_RULES, COMPLIANCE_WHITELIST } from "@/config/compliance";
import type { ComplianceMatch, ComplianceScanDetails, ComplianceSeverity } from "@/types";

const SEVERITY_RANK: Record<ComplianceSeverity, number> = { low: 1, medium: 2, high: 3 };

// 白名单用等长空格替换：长度不变，因此后续命中的 index 仍可直接用于原文定位。
function maskWhitelist(text: string): string {
  let masked = text;
  for (const phrase of COMPLIANCE_WHITELIST) {
    const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    masked = masked.replace(pattern, (hit) => " ".repeat(hit.length));
  }
  return masked;
}

function matchRule(rule: (typeof COMPLIANCE_RULES)[number], text: string): ComplianceMatch[] {
  const pattern = new RegExp(rule.pattern, "gi");
  const matches: ComplianceMatch[] = [];
  for (const hit of text.matchAll(pattern)) {
    if (hit.index === undefined) continue;
    matches.push({
      term: hit[0],
      category: rule.category,
      severity: rule.severity,
      index: hit.index,
      suggestion: rule.suggestion,
    });
  }
  return matches;
}

// 同一位置可能被多条规则命中：按 index 去重，保留严重级别最高的一条。
function dedupeByPosition(matches: ComplianceMatch[]): ComplianceMatch[] {
  const byPosition = new Map<string, ComplianceMatch>();
  for (const match of matches) {
    const key = `${match.index}:${match.term.toLowerCase()}`;
    const existing = byPosition.get(key);
    if (!existing || SEVERITY_RANK[match.severity] > SEVERITY_RANK[existing.severity]) {
      byPosition.set(key, match);
    }
  }
  return [...byPosition.values()];
}

export function scanCompliance(text: string): ComplianceScanDetails {
  const masked = maskWhitelist(text);
  const all = COMPLIANCE_RULES.flatMap((rule) => matchRule(rule, masked));
  const deduped = dedupeByPosition(all).sort((a, b) => a.index - b.index);
  const matches = deduped.slice(0, COMPLIANCE_MAX_MATCHES);
  const riskLevel = matches.reduce<ComplianceSeverity | "none">(
    (worst, match) => (worst === "none" || SEVERITY_RANK[match.severity] > SEVERITY_RANK[worst] ? match.severity : worst),
    "none",
  );
  return {
    passed: matches.length === 0,
    riskLevel,
    scannedChars: text.length,
    matches,
    truncated: deduped.length > matches.length,
  };
}
