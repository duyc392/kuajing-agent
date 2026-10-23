// 用途：店铺知识库检索服务：把店铺画像、长期记忆、商品 DNA、历史脚本与本地领域知识统一检索，返回带来源的片段。
// 与「按用户问题自动注入」的轻量 RAG 共用同一套打分函数（lib/text-match），区别是本服务由 Agent 主动按需调用。
// 所有店铺数据查询强制带 shopId；领域知识是全局资料，不随店铺隔离。
import { prisma } from "@/lib/db";
import { retrieveKnowledgeSections } from "@/lib/knowledge-search";
import { scoreText } from "@/lib/text-match";
import { getShop } from "@/services/shops.service";
import type { KnowledgeSnippet, ShopKnowledgeDetails, ShopKnowledgeScope } from "@/types";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

type Scored = KnowledgeSnippet;

// 只在 score>0 时保留；同分按来源优先级稳定排序，保证多次检索结果一致。
function pick(snippets: Scored[], limit: number): KnowledgeSnippet[] {
  return snippets
    .filter((snippet) => snippet.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((snippet) => ({ ...snippet, score: Number(snippet.score.toFixed(4)) }));
}

async function brandSnippets(shopId: string, query: string): Promise<Scored[]> {
  const shop = await getShop(shopId);
  const text = [shop.name, shop.market, shop.description ?? ""].join(" ");
  return [{ source: "shop", title: `店铺：${shop.name}`, content: text, score: scoreText(query, text) }];
}

async function memorySnippets(shopId: string, query: string): Promise<Scored[]> {
  const rows = await prisma.memoryEntry.findMany({ where: { shopId }, orderBy: { createdAt: "asc" }, take: 200 });
  return rows.map((row) => ({
    source: "memory" as const,
    title: `记忆 · ${row.category}`,
    content: row.content,
    score: scoreText(query, `${row.category} ${row.content}`),
  }));
}

async function productSnippets(shopId: string, query: string): Promise<Scored[]> {
  const rows = await prisma.product.findMany({
    where: { shopId },
    include: { dna: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => {
    const dna = row.dna;
    const content = [
      `商品：${row.name}`,
      row.category ? `类目：${row.category}` : "",
      row.description ?? "",
      dna ? `用户画像：${dna.targetPersona}；场景：${dna.useScenarios}；卖点：${dna.coreSellingPoints}` : "",
      dna ? `视觉钩子：${dna.visualHooks}；推荐形式：${dna.recommendedFormats}` : "",
    ]
      .filter((line) => line !== "")
      .join("\n");
    return { source: "product" as const, title: `商品 · ${row.name}`, content, score: scoreText(query, content) };
  });
}

async function scriptSnippets(shopId: string, query: string): Promise<Scored[]> {
  const rows = await prisma.videoScript.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, hook: true, cta: true, shots: true, createdAt: true },
  });
  return rows.map((row) => {
    const content = `${row.type}｜钩子：${row.hook}｜CTA：${row.cta}\n分镜：${row.shots}`.slice(0, 2000);
    return {
      source: "script" as const,
      title: `脚本 · ${row.type}（${row.createdAt.toISOString().slice(0, 10)}）`,
      content,
      score: scoreText(query, content),
    };
  });
}

async function knowledgeSnippets(query: string): Promise<Scored[]> {
  const sections = await retrieveKnowledgeSections(query, 5);
  return sections.map((section) => ({
    source: "knowledge" as const,
    title: `${section.title}（来源：${section.file}）`,
    content: section.content,
    score: scoreText(query, `${section.title} ${section.content}`),
  }));
}

export async function searchShopKnowledge(params: {
  shopId: string;
  query: string;
  scope: ShopKnowledgeScope;
  limit?: number;
}): Promise<ShopKnowledgeDetails> {
  await getShop(params.shopId);
  const limit = Math.min(Math.max(Math.floor(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const collectors: Record<Exclude<ShopKnowledgeScope, "all">, () => Promise<Scored[]>> = {
    brand: () => brandSnippets(params.shopId, params.query),
    audience: () => memorySnippets(params.shopId, params.query),
    scripts: () => scriptSnippets(params.shopId, params.query),
    products: () => productSnippets(params.shopId, params.query),
  };
  const tasks = params.scope === "all"
    ? [
        brandSnippets(params.shopId, params.query),
        memorySnippets(params.shopId, params.query),
        productSnippets(params.shopId, params.query),
        scriptSnippets(params.shopId, params.query),
        knowledgeSnippets(params.query),
      ]
    : [collectors[params.scope](), ...(params.scope === "brand" ? [knowledgeSnippets(params.query)] : [])];
  const groups = await Promise.all(tasks);
  return { query: params.query, scope: params.scope, snippets: pick(groups.flat(), limit) };
}
