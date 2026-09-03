// 用途：选品候选池结构化操作工具（SPEC 7.2）：模型在对话中发现用户要求修改选品沙盒时调用本工具返回结构化指令数组；
// 工具只产出指令（details），不写数据库、不碰 DOM，由前端 SelectionContext 监听事件执行。指令清洗在 selection.service（纯函数）。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { sanitizeCandidateActions } from "@/services/selection.service";
import { SELECTION_WORKBENCH_TOOL_NAME } from "@/types";
import type { SelectionUiAction, SelectionWorkbenchDetails } from "@/types";

const actionSchema = Type.Union([
  Type.Object({
    type: Type.Literal("KILL_CANDIDATE"),
    candidateId: Type.String({ description: "要淘汰的候选品 ID（候选表中可见），不知道时尝试用商品名与用户确认" }),
    reason: Type.Optional(Type.String({ description: "淘汰原因（简短中文说明）", maxLength: 100 })),
  }),
  Type.Object({
    type: Type.Literal("RESTORE_CANDIDATE"),
    candidateId: Type.String({ description: "要撤销淘汰的候选品 ID" }),
  }),
  Type.Object({
    type: Type.Literal("HIGHLIGHT_LOW_MARGIN"),
    threshold: Type.Number({ description: "毛利率阈值（0~1 小数，如 0.4 表示 40%）", minimum: 0, maximum: 1 }),
  }),
  Type.Object({
    type: Type.Literal("UPDATE_CANDIDATE_COST"),
    candidateId: Type.String({ description: "要修改采购成本的候选品 ID" }),
    costRmb: Type.Number({ description: "新的采购成本（元，人民币）", minimum: 0 }),
  }),
  Type.Object({
    type: Type.Literal("SIMULATE_COMMISSION"),
    commissionRate: Type.Number({ description: "模拟的达人佣金率（0~1 小数，如 0.2 表示 20%）", minimum: 0, maximum: 1 }),
  }),
]);

const workbenchSchema = Type.Object({
  actions: Type.Array(actionSchema, { description: "要执行的选品沙盒操作指令序列（最多 8 条）", minItems: 1, maxItems: 8 }),
});

type WorkbenchParams = Static<typeof workbenchSchema>;

export function createSelectionWorkbenchTool(): AgentTool<typeof workbenchSchema, SelectionWorkbenchDetails> {
  return {
    name: SELECTION_WORKBENCH_TOOL_NAME,
    label: "选品沙盒操作",
    description:
      "当前存在于选品工作台（/selection）的候选品沙盒可被你结构化修改：淘汰/撤销淘汰某候选品、标红低毛利候选品、修改某候选品的采购成本、模拟不同达人佣金率重算全部候选。当用户要求修改候选池（例如「把充电器的成本改为12元」「模拟20%佣金」「标红低毛利」）时调用本工具返回指令列表；只返回指令，不直接改数据。",
    parameters: workbenchSchema,
    async execute(_toolCallId, params: WorkbenchParams, _signal?: AbortSignal): Promise<AgentToolResult<SelectionWorkbenchDetails>> {
      const actions = sanitizeCandidateActions(params.actions);
      return {
        content: [
          {
            type: "text",
            text: actions.length > 0 ? `已生成 ${actions.length} 条选品沙盒操作指令，选品工作台将自动执行。` : "未识别出可执行的操作指令，请确认后重试。",
          },
        ],
        details: { actions },
      };
    },
  };
}
