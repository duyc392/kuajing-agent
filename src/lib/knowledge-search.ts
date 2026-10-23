// 用途：本地领域知识检索（纯函数 + 只读文件）：按问题从 src/agent/knowledge 的 .md 文件检索相关片段。
// 从 agent/knowledge 下沉到 lib：Agent 侧自动注入与店铺知识库工具共用同一实现，避免 services 反向 import agent。
import { promises as fs } from "fs";
import path from "path";
import { scoreText } from "@/lib/text-match";

export interface KnowledgeSection {
  file: string;
  title: string;
  content: string;
}

const KNOWLEDGE_DIR = path.join(process.cwd(), "src", "agent", "knowledge");

// 把单个 .md 文件按二级/三级标题拆成小节，标题后的正文作为该节内容。
function parseSections(file: string, text: string): KnowledgeSection[] {
  const parts = text.split(/^#{2,3}\s+(.+)$/m);
  const sections: KnowledgeSection[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    const title = parts[index].trim();
    const body = (parts[index + 1] ?? "").trim();
    if (body !== "") sections.push({ file, title, content: body });
  }
  return sections;
}

// 读取失败只记服务端日志并返回空数组：知识检索是增强项，绝不阻断本轮对话。
export async function loadKnowledgeSections(): Promise<KnowledgeSection[]> {
  try {
    const files = (await fs.readdir(KNOWLEDGE_DIR)).filter((name) => name.endsWith(".md"));
    const sections: KnowledgeSection[] = [];
    for (const file of files) {
      const text = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf8");
      sections.push(...parseSections(file, text));
    }
    return sections;
  } catch (error) {
    console.error("[knowledge] 领域知识读取失败（本轮不注入知识）:", error);
    return [];
  }
}

export async function retrieveKnowledgeSections(question: string, limit = 3): Promise<KnowledgeSection[]> {
  const sections = await loadKnowledgeSections();
  return sections
    .map((section) => ({ section, score: scoreText(question, `${section.title} ${section.content}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.section);
}
