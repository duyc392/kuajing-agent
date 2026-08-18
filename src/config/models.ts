// 用途：三个服务的默认模型配置（引导页预填值与 data/config.json 缺省值的唯一来源，不在组件里硬编码）。
export const LLM_DEFAULTS = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  memoryModel: "deepseek-chat",
};

export const IMAGE_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
};

export const FASTMOSS_DEFAULTS = {
  baseUrl: "https://open.fastmoss.com",
};
