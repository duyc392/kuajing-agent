// 用途：三个服务的默认模型配置（引导页预填值与 data/config.json 缺省值的唯一来源，不在组件里硬编码）。
// 注：deepseek-chat 别名已于 2026-07 官方退役，默认模型为 deepseek-v4-flash（旧配置里存的别名需在设置页手动改）。
export const LLM_DEFAULTS = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  memoryModel: "deepseek-v4-flash",
};

export const IMAGE_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
};

export const FASTMOSS_DEFAULTS = {
  baseUrl: "https://mcp.fastmoss.com",
};
