// 用途：密钥业务域类型：三个服务密钥的完整结构、保存输入（允许部分更新）与脱敏后的状态（Key 全文永不返回前端）。
export interface LlmKeyConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  memoryModel: string;
}

export interface ImageKeyConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface FastmossKeyConfig {
  apiKey: string;
  baseUrl: string;
}

export interface KeysConfig {
  llm: LlmKeyConfig;
  image: ImageKeyConfig;
  fastmoss: FastmossKeyConfig;
}

export interface SaveKeysInput {
  llm?: Partial<LlmKeyConfig>;
  image?: Partial<ImageKeyConfig>;
  fastmoss?: Partial<FastmossKeyConfig>;
}

export interface KeyGroupStatus {
  configured: boolean;
  maskedKey: string;
  baseUrl: string;
  model: string;
  memoryModel?: string;
}

export interface KeysStatus {
  llm: KeyGroupStatus;
  image: KeyGroupStatus;
  fastmoss: KeyGroupStatus;
  allConfigured: boolean;
}
