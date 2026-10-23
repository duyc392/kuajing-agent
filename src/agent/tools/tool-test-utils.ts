// 用途：工具测试共用函数：从 AgentToolResult.content 取出第一段文本，非文本内容直接报错。
export function firstText(content: Array<{ type: string; text?: string }>): string {
  const part = content[0];
  if (part?.type !== "text" || typeof part.text !== "string") {
    throw new Error("工具结果缺少文本内容");
  }
  return part.text;
}
