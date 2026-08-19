// 用途：Agent 层公共类型：模型单次生成的依赖函数（由 execute 注入到各工具/编排，含审计所需模型名）与生成审计入参。
export interface GenerateTextFn {
  (systemPrompt: string, userPrompt: string, signal?: AbortSignal): Promise<string>;
  /** 本次调用使用的模型名，供生成审计记录（PRD：每次 AI 调用留一条含模型的记录）。 */
  readonly modelId?: string;
}

export interface GenerationInput {
  shopId: string | null;
  type: "copywriting" | "script" | "live-script" | "memory" | "selection" | "image" | "chat";
  model: string;
  prompt: string;
  output?: string;
  status: "success" | "error";
  error?: string;
}
