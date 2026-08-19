// 用途：初始化 Pi Agent Harness，注入模型配置与系统提示词（SDK 接入的唯一切入点）。
// 模型：DeepSeek（OpenAI 兼容端点，baseUrl/model 取自本机 data/config.json）；
// 测试模式：环境变量 KUAJING_AGENT_FAUX=1 时改用 pi 的 faux 内存模型（回显用户消息），供无 Key 的端到端测试使用。
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  type Api,
  type Model,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { LLM_DEFAULTS } from "@/config/models";
import { readKeysConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const FAUX_ENV = "KUAJING_AGENT_FAUX";
const DEEPSEEK_DEFAULT_BASE = LLM_DEFAULTS.baseUrl;

export interface CreateAgentOptions {
  systemPrompt: string;
  messages: AgentMessage[];
  // 覆盖配置里的主模型 id（如记忆提取用 memoryModel）；缺省时使用 keys.llm.model。
  model?: string;
}

interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function registerFaux(models: MutableModels): Model<Api> {
  const faux = fauxProvider({ tokensPerSecond: 80 });
  models.setProvider(faux.provider);
  faux.setResponses([
    (context) => {
      const lastUser = [...context.messages].reverse().find((message) => message.role === "user");
      let text = "（空）";
      if (lastUser) {
        if (typeof lastUser.content === "string") text = lastUser.content;
        else if (Array.isArray(lastUser.content)) {
          text = lastUser.content
            .filter((block): block is { type: "text"; text: string } => block.type === "text")
            .map((block) => block.text)
            .join("");
        }
      }
      return fauxAssistantMessage([fauxText(`（测试模式回复）你说的是：${text}`)]);
    },
  ]);
  return faux.getModel();
}

function customDeepseekProvider(settings: LlmSettings) {
  const providerId = "deepseek-custom";
  const model: Model<"openai-completions"> = {
    id: settings.model,
    name: `${settings.model}（自定义端点）`,
    api: "openai-completions",
    provider: providerId,
    baseUrl: settings.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
  return createProvider({
    id: providerId,
    name: "DeepSeek（自定义端点）",
    baseUrl: settings.baseUrl,
    // 实际 Key 由 Agent 的 getApiKey 回调按请求注入，这里只需可用的占位解析器。
    auth: { apiKey: { name: "DeepSeek API key", resolve: async () => ({ auth: {} }) } },
    models: [model],
    api: openAICompletionsApi(),
  });
}

function registerDeepseek(models: MutableModels, settings: LlmSettings): Model<Api> {
  if (settings.baseUrl !== DEEPSEEK_DEFAULT_BASE) {
    models.setProvider(customDeepseekProvider(settings));
    return mustGetModel(models, "deepseek-custom", settings.model);
  }
  models.setProvider(deepseekProvider());
  const registered = models.getModel("deepseek", settings.model);
  if (registered) return registered;
  // 官方注册表没有该模型 id（如 deepseek-chat 别名或新模型）：按请求的模型 id 注册自定义 provider（端点不变），不静默改用别的模型。
  models.setProvider(customDeepseekProvider(settings));
  return mustGetModel(models, "deepseek-custom", settings.model);
}

function mustGetModel(models: MutableModels, providerId: string, modelId: string): Model<Api> {
  const model = models.getModel(providerId, modelId);
  if (!model) throw new AppError(`未找到可用的模型配置：${modelId}`, "MODEL_NOT_FOUND", 500);
  return model;
}

export async function createAgent(options: CreateAgentOptions): Promise<Agent> {
  const useFaux = process.env[FAUX_ENV] === "1";
  const settings: LlmSettings = useFaux
    ? { apiKey: "", baseUrl: DEEPSEEK_DEFAULT_BASE, model: "deepseek-chat" }
    : await (async () => {
        const keys = await readKeysConfig();
        return {
          apiKey: keys.llm.apiKey,
          baseUrl: keys.llm.baseUrl || DEEPSEEK_DEFAULT_BASE,
          model: options.model || keys.llm.model || "deepseek-chat",
        };
      })();
  // provider 注册与流式调用共用同一个 models 实例（分开注册会导致流式时 Unknown provider）。
  const models = createModels();
  const model = useFaux ? registerFaux(models) : registerDeepseek(models, settings);

  const agent = new Agent({
    initialState: { systemPrompt: options.systemPrompt, model, messages: options.messages },
    streamFn: models.streamSimple.bind(models),
  });
  if (!useFaux) {
    // Key 从本机配置按请求注入（不落环境变量）；faux 模式无需 Key。
    agent.getApiKey = (provider: string) =>
      provider.startsWith("deepseek") ? settings.apiKey || undefined : undefined;
  }
  return agent;
}
