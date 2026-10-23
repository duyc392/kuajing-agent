// 用途：评论清洗（纯函数，无 IO）：去重（同文本或高度相似）、过滤灌水/纯表情/纯链接/过短文本、统计星级分布。
// 供 reviews 服务在返回前做确定性预处理，保证 Skill 拿到的样本数字可直接引用，不需要模型自己数。
export interface FilterableText {
  text: string;
}

export interface FilterResult<T> {
  kept: T[];
  deduped: number;
  spamFiltered: number;
}

const MIN_WORDS = 3;
const MIN_CHARS = 8;
const URL_ONLY = /^(https?:\/\/\S+\s*)+$/i;
const EMOJI_ONLY = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// 灌水判定：纯链接、纯表情、词数或字符数太少。都是可解释的确定性规则，不用模型判别。
export function isSpamText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return true;
  if (URL_ONLY.test(trimmed)) return true;
  if (EMOJI_ONLY.test(trimmed)) return true;
  const words = trimmed.split(/[\s,.;:!?]+/).filter((word) => word !== "");
  return words.length < MIN_WORDS && trimmed.length < MIN_CHARS;
}

export function filterReviews<T extends FilterableText>(items: T[]): FilterResult<T> {
  const seen = new Set<string>();
  const kept: T[] = [];
  let deduped = 0;
  let spamFiltered = 0;
  for (const item of items) {
    if (isSpamText(item.text)) {
      spamFiltered += 1;
      continue;
    }
    const key = normalize(item.text);
    if (seen.has(key)) {
      deduped += 1;
      continue;
    }
    seen.add(key);
    kept.push(item);
  }
  return { kept, deduped, spamFiltered };
}

// 星级分布：只统计合法星级（1-5），空星级不计入。
export function ratingCounts(ratings: Array<number | null>): Record<string, number> {
  const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const rating of ratings) {
    if (rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      counts[String(rating)] += 1;
    }
  }
  return counts;
}
