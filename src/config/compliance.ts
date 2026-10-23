// 用途：TikTok 平台合规词库与扫描上限：医疗功效、绝对化用语、侵权品牌、平台违禁品、金融承诺五类。
// 规则以正则源码形式存储（扫描时重建带 g 标志的实例，避免 lastIndex 状态在多次扫描间残留）。
// 只做确定性扫描与标注，不改写文案；词库可随平台规则演进在此单点维护。
import type { ComplianceCategory, ComplianceSeverity } from "@/types";

export interface ComplianceRule {
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  /** 正则源码（不含标志），扫描时以 gi 重建 */
  pattern: string;
  /** 命中后给卖家的替换建议 */
  suggestion: string;
}

export const COMPLIANCE_RULES: ComplianceRule[] = [
  // 医疗功效：宠物医药与美妆个护都容易踩线
  { category: "medical", severity: "high", pattern: "\\bcures?\\b", suggestion: "改为描述使用感受，如 helps relieve / supports" },
  { category: "medical", severity: "high", pattern: "\\btreats?\\b", suggestion: "避免治疗宣称，改为 supports daily care" },
  { category: "medical", severity: "high", pattern: "\\bheals?\\b", suggestion: "避免疗效宣称，改为 helps soothe" },
  { category: "medical", severity: "high", pattern: "\\btherapy\\b", suggestion: "非医疗器械不得使用 therapy" },
  { category: "medical", severity: "high", pattern: "\\bmedical[- ]grade\\b", suggestion: "未认证不得宣称医疗级" },
  { category: "medical", severity: "high", pattern: "\\bFDA\\s*approved\\b", suggestion: "无证书不得宣称 FDA 认证" },
  { category: "medical", severity: "high", pattern: "\\bclinically\\s+(proven|tested)\\b", suggestion: "无临床证据不得宣称" },
  { category: "medical", severity: "high", pattern: "治疗|治愈|消炎|杀菌|医疗级|药效", suggestion: "删除医疗功效表述，改为使用体验描述" },

  // 绝对化用语
  { category: "absolute", severity: "medium", pattern: "\\bbest[- ]?(seller|selling)?\\b", suggestion: "改为 top-rated / popular" },
  { category: "absolute", severity: "medium", pattern: "\\b100\\s*%", suggestion: "删除绝对化比例，改为 results may vary" },
  { category: "absolute", severity: "medium", pattern: "\\bno\\.?\\s*1\\b|\\bnumber\\s+one\\b", suggestion: "删除排名宣称" },
  { category: "absolute", severity: "medium", pattern: "\\bguaranteed\\b", suggestion: "改为 designed to" },
  { category: "absolute", severity: "medium", pattern: "\\binstantly\\b", suggestion: "改为 quickly" },
  { category: "absolute", severity: "medium", pattern: "\\bnever\\s+(fails?|breaks?)\\b", suggestion: "删除绝对化承诺" },
  { category: "absolute", severity: "medium", pattern: "最好|最佳|第一|绝对|百分百|永久", suggestion: "改用相对表述（更耐用 / 更省心）" },

  // 侵权品牌与角色
  { category: "brand", severity: "high", pattern: "\\b(nike|adidas|apple|disney|gucci|louis\\s+vuitton|hello\\s+kitty|pokemon)\\b", suggestion: "删除他人品牌名，改品类通用描述" },

  // 平台违禁品
  { category: "platform", severity: "high", pattern: "\\b(gun|firearm|ammunition|vape|cbd|prescription|replica|knock-?off)\\b", suggestion: "TikTok 禁止或限流该类商品，删除相关表述" },
  { category: "platform", severity: "high", pattern: "假货|高仿|仿品|走私", suggestion: "删除违规表述" },

  // 金融承诺
  { category: "finance", severity: "high", pattern: "\\b(risk[- ]free|get\\s+rich|guaranteed\\s+(income|return))\\b", suggestion: "删除收益承诺" },
  { category: "finance", severity: "high", pattern: "稳赚|保本|零风险|躺赚", suggestion: "删除收益承诺" },
];

/** 白名单：命中但属于正常表达的短语（先剔除再扫描），避免误伤。 */
export const COMPLIANCE_WHITELIST = ["best regards", "do your best"];

export const COMPLIANCE_MAX_MATCHES = 100;
