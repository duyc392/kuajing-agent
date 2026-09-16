// 用途：技能沉淀工具（PRD 故事 46）：模型在发现卖家反复提出同一类要求时，调用本工具提议把该模式沉淀为可复用技能。
// 本工具只提议、不落盘——把拟创建的技能内容作为结构化详情返回，由对话确认卡片交卖家确认后才真正创建（确认后技能才创建）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX, SKILL_PROMPT_MAX, SKILL_RESIDENT_HINT_CHARS } from "@/config/skills";
import { PROPOSE_SKILL_TOOL_NAME, type SkillProposalDetails } from "@/types";

const proposeSkillSchema = Type.Object({
  name: Type.String({ description: "技能名称，简短（如「强调包邮」），供设置页列表展示", minLength: 1, maxLength: SKILL_NAME_MAX }),
  description: Type.String({
    description: `说明这个技能什么情况下适用（如「生成美区商品文案时」），按需技能靠它判断何时加载；可为空，上限 ${SKILL_DESCRIPTION_MAX} 字`,
    maxLength: SKILL_DESCRIPTION_MAX,
  }),
  prompt: Type.String({ description: "可复用的指令内容：以后生成文案、脚本或建议时应遵守的具体要求", minLength: 1, maxLength: SKILL_PROMPT_MAX }),
  alwaysApply: Type.Boolean({
    description: `常驻开关：true=每轮自动应用的短偏好规则（正文约 ${SKILL_RESIDENT_HINT_CHARS} 字以内选它）；false=较长的操作手册，Agent 判断与本轮任务相关时用 load_skill 按需加载`,
  }),
});

type ProposeSkillParams = Static<typeof proposeSkillSchema>;

export function createProposeSkillTool(): AgentTool<typeof proposeSkillSchema, SkillProposalDetails> {
  return {
    name: PROPOSE_SKILL_TOOL_NAME,
    label: "提议沉淀技能",
    description:
      "当你在对话中发现卖家反复提出同一类要求（例如多次要求强调包邮、固定的话术风格或输出格式）时，调用本工具提议把该模式沉淀为可复用技能。description 写清楚该技能什么情况下适用；简短偏好规则 alwaysApply 用 true，较长操作手册用 false。只提议、不创建，技能必须等卖家在卡片上确认后才创建。",
    parameters: proposeSkillSchema,
    async execute(_toolCallId, params: ProposeSkillParams, _signal?: AbortSignal): Promise<AgentToolResult<SkillProposalDetails>> {
      return {
        content: [
          {
            type: "text",
            text:
              `建议把「${params.name}」沉淀为可复用技能（${params.alwaysApply ? "常驻，每轮自动应用" : "按需，相关任务时自动加载"}）：${
                params.description === "" ? "以后自动应用这条要求" : params.description
              }。请卖家在卡片上确认是否创建。`,
          },
        ],
        details: { name: params.name, description: params.description, prompt: params.prompt, alwaysApply: params.alwaysApply },
      };
    },
  };
}
