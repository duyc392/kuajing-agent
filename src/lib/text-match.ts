// 用途：文本相似度基础函数（纯函数）：中文无空格分词，把文本压成连续 2 字片段（bigram）作为关键词集合。
// 本地知识检索与店铺知识库检索共用同一套计分口径，避免两处各写一套导致命中结果不一致。
const STOPWORD_BIGRAMS = new Set(["什么", "怎么", "哪些", "如何", "请问", "帮我", "给我", "一份", "一个", "一下", "问题", "想要", "需要", "我希", "请给", "可以"]);

export function bigrams(text: string): Set<string> {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  const grams = new Set<string>();
  for (let index = 0; index + 2 <= compact.length; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  return grams;
}

// 疑问/请求里的常见用语片段不承载主题，从问题关键词里去掉，避免造成误命中。
export function meaningfulGrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const gram of bigrams(text)) {
    if (!STOPWORD_BIGRAMS.has(gram)) grams.add(gram);
  }
  return grams;
}

// 问题与候选文本的重叠率（0-1）：问题关键词被覆盖的比例。
export function scoreText(question: string, candidate: string): number {
  const questionGrams = meaningfulGrams(question);
  if (questionGrams.size === 0) return 0;
  const candidateGrams = bigrams(candidate);
  let hits = 0;
  for (const gram of questionGrams) {
    if (candidateGrams.has(gram)) hits += 1;
  }
  return hits / questionGrams.size;
}
