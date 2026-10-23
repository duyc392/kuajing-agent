// 用途：交付前的确定性校验工具：引文核查与分镜结构校验各自独立，只报告问题，不改写内容。
// 主 Agent 必须按返回的 problems 逐条修正后再次调用，硬性项清零才允许交付或落库。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { verifyCitations } from "@/lib/citations";
import { validateStoryboard } from "@/lib/storyboard-rules";
import { STORY_PHASES, type CitationCheckDetails, type StoryboardValidationDetails } from "@/types";

const phaseSchema = Type.Union(
  [Type.Literal("hook"), Type.Literal("pain"), Type.Literal("demo"), Type.Literal("proof"), Type.Literal("cta")],
  { description: "叙事阶段：hook 钩子 / pain 痛点 / demo 演示 / proof 证明 / cta 行动号召" },
);

const citationsSchema = Type.Object({
  quotes: Type.Array(
    Type.Object({
      quote: Type.String({ description: "你准备在结论里引用的原文片段", minLength: 1, maxLength: 2000 }),
      label: Type.Optional(Type.String({ description: "这条引文对应哪条结论（如 P1 续航差）", maxLength: 100 })),
    }),
    { description: "要核查的引文列表", minItems: 1, maxItems: 60 },
  ),
  corpus: Type.String({ description: "原始语料全文（逐字稿或全部评论原文），用于逐字比对", minLength: 1, maxLength: 60000 }),
});

const storyboardSchema = Type.Object({
  expectedSeconds: Type.Integer({ description: "目标总时长（秒）", minimum: 5, maximum: 600 }),
  shots: Type.Array(
    Type.Object({
      index: Type.Integer({ description: "镜号，从 1 开始连续", minimum: 1, maximum: 60 }),
      phase: phaseSchema,
      seconds: Type.Integer({ description: "本镜秒数", minimum: 1, maximum: 600 }),
      visual: Type.String({ description: "中文画面/拍摄指令", minLength: 1, maxLength: 500 }),
      imagePrompt: Type.String({ description: "英文生图提示词（只允许 ASCII）", maxLength: 1000 }),
      voiceover: Type.String({ description: "目标语言口播", minLength: 1, maxLength: 1000 }),
      subtitle: Type.String({ description: "目标语言字幕", minLength: 1, maxLength: 1000 }),
      audioNote: Type.String({ description: "BGM/音效指令", minLength: 1, maxLength: 200 }),
      onScreenText: Type.Optional(Type.String({ description: "屏幕贴字", maxLength: 200 })),
      painPointId: Type.Optional(Type.String({ description: "关联的痛点编号，如 P1", maxLength: 20 })),
    }),
    { description: "分镜列表", minItems: 1, maxItems: 40 },
  ),
});

type CitationsParams = Static<typeof citationsSchema>;
type StoryboardParams = Static<typeof storyboardSchema>;

export function createVerifyCitationsTool(): AgentTool<typeof citationsSchema, CitationCheckDetails> {
  return {
    name: "verify_citations",
    label: "引文核查",
    description:
      "逐字核查你准备引用的原文是否真的出现在原始语料里（逐字稿或评论原文）。拆解与痛点交付前必须调用；返回 problems 时逐条改成原文后再验一次，禁止改写引文冒充原文。",
    parameters: citationsSchema,
    async execute(_toolCallId, params: CitationsParams): Promise<AgentToolResult<CitationCheckDetails>> {
      const details = verifyCitations(params.quotes, params.corpus);
      const text = details.valid
        ? `引文核查通过：${details.checked} 条全部逐字命中原文。`
        : [
            `引文核查未通过：${details.problems.length} 条找不到原文。`,
            ...details.problems.map((problem) => `- ${problem.label === "" ? "未标注" : problem.label}：「${problem.quote}」→ ${problem.reason}`),
            "请把这些引文换成语料里的原文（不要改写成近义句），然后重新核查。",
          ].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}

export function createValidateStoryboardTool(): AgentTool<typeof storyboardSchema, StoryboardValidationDetails> {
  return {
    name: "validate_storyboard",
    label: "分镜结构校验",
    description:
      "检查分镜是否合格：秒数合计等于目标时长、首镜不超过 3 秒且为 hook、五段齐全、每镜四要素齐全、生图提示词为纯英文、至少一镜关联痛点。分镜落库前必须调用，按 problems 改到 valid=true 再保存。",
    parameters: storyboardSchema,
    async execute(_toolCallId, params: StoryboardParams): Promise<AgentToolResult<StoryboardValidationDetails>> {
      const details = validateStoryboard({ shots: params.shots, expectedSeconds: params.expectedSeconds });
      const text = details.valid
        ? `分镜校验通过：${details.shotCount} 镜，合计 ${details.totalSeconds} 秒。`
        : [`分镜校验未通过（${details.problems.length} 个问题）：`, ...details.problems.map((problem) => `- ${problem}`), "请逐条修正后重新校验。"].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}
