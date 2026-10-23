// 用途：阶段快照工具：保存 / 读取 / 列出版本，三个动作各一个工具，只做序列化存取。
// 主 Agent 在选品、拆解、痛点、分镜、脚本、归档阶段主动保存；局部重写时读取上一版。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { listSnapshots, loadSnapshot, saveSnapshot } from "@/services/snapshot.service";
import { SNAPSHOT_STAGES, type SnapshotListDetails, type SnapshotLoadDetails, type SnapshotSaveDetails } from "@/types";

const stageSchema = Type.Union(SNAPSHOT_STAGES.map((stage) => Type.Literal(stage)));

const saveSchema = Type.Object({
  stage: stageSchema,
  payload: Type.String({ description: "阶段产物的 JSON 文本（必须是合法 JSON 对象）", minLength: 2, maxLength: 200000 }),
});

const loadSchema = Type.Object({
  stage: stageSchema,
  mode: Type.Optional(
    Type.Union([Type.Literal("latest"), Type.Literal("previous")], {
      description: "latest=取最新版（默认）；previous=回退一版，用于「不满意重做」",
    }),
  ),
  version: Type.Optional(Type.Integer({ description: "指定版本号，填了就不再按 mode 取", minimum: 1 })),
});

const listSchema = Type.Object({
  stage: Type.Optional(stageSchema),
  limit: Type.Optional(Type.Integer({ description: "返回条数，默认 10，上限 50", minimum: 1, maximum: 50 })),
});

type SaveParams = Static<typeof saveSchema>;
type LoadParams = Static<typeof loadSchema>;
type ListParams = Static<typeof listSchema>;

export function createSaveSnapshotTool(deps: { shopId: string }): AgentTool<typeof saveSchema, SnapshotSaveDetails> {
  return {
    name: "save_snapshot",
    label: "保存阶段快照",
    description:
      "把当前阶段已确认的产物存成快照（版本号自动递增）。卖家确认某阶段结论后调用；同一阶段可以反复保存，形成版本历史，后续局部重写时读取上一版即可，不用把整条链路重跑。",
    parameters: saveSchema,
    async execute(_toolCallId, params: SaveParams): Promise<AgentToolResult<SnapshotSaveDetails>> {
      const details = await saveSnapshot({ shopId: deps.shopId, stage: params.stage, payload: params.payload });
      return {
        content: [{ type: "text", text: `已保存 ${details.stage} 第 ${details.version} 版快照。` }],
        details,
      };
    },
  };
}

export function createLoadSnapshotTool(deps: { shopId: string }): AgentTool<typeof loadSchema, SnapshotLoadDetails> {
  return {
    name: "load_snapshot",
    label: "读取阶段快照",
    description:
      "读取某阶段已保存的产物：默认取最新版；mode=previous 取上一版，用于卖家说「不满意，重做」时只改一处、其余保持不变。没有快照会明确报错，此时应先补齐上游阶段，不要凭空编内容。",
    parameters: loadSchema,
    async execute(_toolCallId, params: LoadParams): Promise<AgentToolResult<SnapshotLoadDetails>> {
      const details = await loadSnapshot({
        shopId: deps.shopId,
        stage: params.stage,
        mode: params.mode,
        version: params.version,
      });
      const text = `已读取 ${details.stage} 第 ${details.version} 版快照${details.rolledBack ? "（上一版）" : ""}，内容见 details.payload。`;
      return { content: [{ type: "text", text }], details };
    },
  };
}

export function createListSnapshotsTool(deps: { shopId: string }): AgentTool<typeof listSchema, SnapshotListDetails> {
  return {
    name: "list_snapshots",
    label: "列出阶段快照",
    description: "列出当前店铺各阶段已保存的快照版本（可按阶段过滤）。写分镜前先用它确认上游阶段是否已完成。",
    parameters: listSchema,
    async execute(_toolCallId, params: ListParams): Promise<AgentToolResult<SnapshotListDetails>> {
      const details = await listSnapshots({ shopId: deps.shopId, stage: params.stage, limit: params.limit });
      const text = details.snapshots.length === 0
        ? "当前店铺还没有任何快照。"
        : [`共 ${details.snapshots.length} 条快照：`, ...details.snapshots.map((item) => `- ${item.stage} v${item.version}（${item.createdAt.slice(0, 16).replace("T", " ")}，${item.payloadChars} 字符）`)].join("\n");
      return { content: [{ type: "text", text }], details };
    },
  };
}
