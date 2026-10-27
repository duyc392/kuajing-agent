// 用途：上下文预算集中配置。均为保守近似 token 预算，不是精确分词；自定义模型容量须按供应商配置。
export interface ContextSettings {
  fallbackCapacity: number;
  fallbackMaxTokens: number;
  outputTokens: number;
  safetyTokens: number;
  toolReserveTokens: number;
  summaryTokens: number;
  estimateMargin: number;
}

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function readContextSettings(): ContextSettings {
  return {
    fallbackCapacity: positiveEnv("CONTEXT_FALLBACK_CAPACITY", 65536),
    fallbackMaxTokens: positiveEnv("CONTEXT_FALLBACK_MAX_TOKENS", 4096),
    outputTokens: positiveEnv("CONTEXT_OUTPUT_TOKENS", 4096),
    safetyTokens: positiveEnv("CONTEXT_SAFETY_TOKENS", 2048),
    toolReserveTokens: positiveEnv("CONTEXT_TOOL_RESERVE_TOKENS", 4096),
    summaryTokens: positiveEnv("CONTEXT_SUMMARY_TOKENS", 2048),
    estimateMargin: 1.25,
  };
}
