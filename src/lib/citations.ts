// 用途：引文核查（纯函数，无 IO）：校验主 Agent 给出的每条引文是否真的能在原始语料中逐字找到。
// 只比对，不改写；比较前统一折叠空白与大小写，避免因排版差异误判，但不做同义替换或近似匹配。
import type { CitationCheckDetails, CitationInput, CitationProblem } from "@/types";

const MAX_PROBLEMS = 50;

export function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase().trim();
}

export function verifyCitations(quotes: CitationInput[], corpus: string): CitationCheckDetails {
  const haystack = normalizeForMatch(corpus);
  const problems: CitationProblem[] = [];
  let checked = 0;
  for (const item of quotes) {
    const label = item.label ?? "";
    const needle = normalizeForMatch(item.quote);
    if (needle === "") {
      problems.push({ quote: item.quote, label, reason: "引文为空" });
      continue;
    }
    checked += 1;
    if (!haystack.includes(needle)) {
      problems.push({ quote: item.quote, label, reason: "在原始语料中找不到这段原文" });
    }
  }
  return { valid: problems.length === 0, checked, problems: problems.slice(0, MAX_PROBLEMS) };
}
