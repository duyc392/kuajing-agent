// 用途：Agent 系统提示词：注入当前店铺上下文（名称 / 市场 / 简述），让回答始终围绕当前店铺的跨境运营。
export interface ShopPromptContext {
  name: string;
  market: string;
  description: string | null;
}

export function buildSystemPrompt(shop: ShopPromptContext): string {
  const about = [`店铺名称：${shop.name}`, `目标市场：${shop.market}`];
  if (shop.description) about.push(`店铺简述：${shop.description}`);
  return [
    "你是 TikTok 跨境电商工作台里的运营助手，服务一位独立卖家。",
    "你的回答要务实、可直接执行，优先给出具体做法而不是泛泛而谈。",
    "你当前服务的店铺信息如下，回答时要贴合这个店铺的定位：",
    about.map((line) => `- ${line}`).join("\n"),
    "默认使用中文回答；卖家用其他语言提问时跟随其语言。",
  ].join("\n");
}
