// 用途：落库工具：把主 Agent 写好的文案 / 视频脚本 / 直播脚本存成正式版本，各自一个工具。
// 只做校验与写入，不生成内容、不调用模型；时长与总分钟数由内容求和得出，避免与内容不一致。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { createCopy } from "@/services/product-copies.service";
import { createScript } from "@/services/video-scripts.service";
import { createLiveScript } from "@/services/live-scripts.service";
import { resolveProductByName } from "@/services/product-lookup.service";
import { COPY_TOOL_NAME, SCRIPT_TOOL_NAME, LIVE_SCRIPT_TOOL_NAME } from "@/types";
import type { CopyToolDetails, LiveScriptToolDetails, ScriptToolDetails } from "@/types";

const copySchema = Type.Object({
  productName: Type.String({ description: "商品名称，用卖家消息里的原文", minLength: 1, maxLength: 200, pattern: "\\S" }),
  language: Type.String({ description: "文案语言代码，如 en / id / th / vi / zh", minLength: 2, maxLength: 8 }),
  title: Type.String({ description: "商品标题", minLength: 1, maxLength: 200, pattern: "\\S" }),
  description: Type.String({ description: "商品描述", minLength: 1, maxLength: 4000, pattern: "\\S" }),
  sellingPoints: Type.Optional(Type.String({ description: "卖点列表（每条一行）", maxLength: 2000 })),
});

const shotSchema = Type.Object({
  scene: Type.String({ description: "画面/拍摄指令（中文）", minLength: 1, maxLength: 500 }),
  voiceover: Type.String({ description: "目标语言口播", minLength: 1, maxLength: 1000 }),
  subtitle: Type.String({ description: "目标语言字幕", minLength: 1, maxLength: 1000 }),
  seconds: Type.Integer({ description: "本镜秒数", minimum: 1, maximum: 600 }),
  comfyuiPrompt: Type.Optional(Type.String({ description: "英文生图提示词", maxLength: 1000 })),
  audioNote: Type.Optional(Type.String({ description: "BGM/音效指令", maxLength: 200 })),
});

const scriptSchema = Type.Object({
  productName: Type.Optional(Type.String({ description: "关联商品名称；未指定商品时省略", maxLength: 200 })),
  type: Type.Union([Type.Literal("开箱"), Type.Literal("教程"), Type.Literal("种草"), Type.Literal("对比")], {
    description: "脚本类型",
  }),
  language: Type.String({ description: "口播语言代码", minLength: 2, maxLength: 8 }),
  hook: Type.String({ description: "前 3 秒钩子文案（目标语言）", minLength: 1, maxLength: 500, pattern: "\\S" }),
  cta: Type.String({ description: "结尾行动号召（目标语言）", minLength: 1, maxLength: 500, pattern: "\\S" }),
  style: Type.Optional(Type.String({ description: "参考风格描述", maxLength: 200 })),
  shots: Type.Array(shotSchema, { description: "分镜列表，秒数之和即总时长", minItems: 1, maxItems: 40 }),
});

const liveSchema = Type.Object({
  productNames: Type.Optional(
    Type.Array(Type.String({ description: "商品名称", minLength: 1, maxLength: 200 }), {
      description: "本场讲解的商品名称列表；省略表示店铺全部商品",
      maxItems: 20,
    }),
  ),
  segments: Type.Array(
    Type.Object({
      phase: Type.String({ description: "阶段名，如 开场 / 讲解 / 互动 / 促销", minLength: 1, maxLength: 50 }),
      minutes: Type.Integer({ description: "阶段时长（分钟）", minimum: 1, maximum: 120 }),
      goal: Type.String({ description: "阶段目标", minLength: 1, maxLength: 300 }),
      script: Type.String({ description: "关键话术（目标语言）", minLength: 1, maxLength: 2000 }),
    }),
    { description: "直播流程阶段列表", minItems: 1, maxItems: 30 },
  ),
});

type CopyParams = Static<typeof copySchema>;
type ScriptParams = Static<typeof scriptSchema>;
type LiveParams = Static<typeof liveSchema>;

export function createSaveCopyTool(deps: { shopId: string }): AgentTool<typeof copySchema, CopyToolDetails> {
  return {
    name: COPY_TOOL_NAME,
    label: "保存商品文案",
    description:
      "把已写好的商品文案存成新版本并设为当前版本。文案必须先由你按文案 SOP 写好（含合规扫描通过），本工具只落库。卖家要求生成或修改商品文案时，写完调用本工具；修改意见来自卖家时在新版本里体现。",
    parameters: copySchema,
    async execute(_toolCallId, params: CopyParams): Promise<AgentToolResult<CopyToolDetails>> {
      const product = await resolveProductByName({ productName: params.productName.trim(), shopId: deps.shopId });
      const row = await createCopy({
        productId: product.id,
        shopId: deps.shopId,
        title: params.title.trim(),
        description: params.description.trim(),
        sellingPoints: params.sellingPoints === undefined || params.sellingPoints.trim() === "" ? null : params.sellingPoints.trim(),
        language: params.language,
        source: "ai",
      });
      const details: CopyToolDetails = {
        copyId: row.id,
        productId: product.id,
        title: row.title,
        description: row.description,
        sellingPoints: row.sellingPoints ?? "",
        language: row.language,
        version: row.version,
        isCurrent: row.isCurrent,
      };
      return {
        content: [{ type: "text", text: `已保存 ${details.language} 文案第 ${details.version} 版（标题：${details.title}），可在商品详情页「文案历史」查看。` }],
        details,
      };
    },
  };
}

export function createSaveScriptTool(deps: { shopId: string }): AgentTool<typeof scriptSchema, ScriptToolDetails> {
  return {
    name: SCRIPT_TOOL_NAME,
    label: "保存视频脚本",
    description:
      "把已写好的分镜脚本存到「脚本」页面，总时长由分镜秒数求和得出。脚本必须先经 validate_storyboard 与 check_tiktok_compliance 通过，本工具只落库。",
    parameters: scriptSchema,
    async execute(_toolCallId, params: ScriptParams): Promise<AgentToolResult<ScriptToolDetails>> {
      const product = params.productName === undefined || params.productName.trim() === ""
        ? null
        : await resolveProductByName({ productName: params.productName.trim(), shopId: deps.shopId });
      const duration = params.shots.reduce((sum, shot) => sum + shot.seconds, 0);
      const row = await createScript({
        shopId: deps.shopId,
        productId: product?.id ?? null,
        type: params.type,
        duration,
        hook: params.hook.trim(),
        cta: params.cta.trim(),
        style: params.style?.trim() || null,
        shots: params.shots,
      });
      const details: ScriptToolDetails = {
        scriptId: row.id,
        type: row.type,
        duration: row.duration,
        hook: row.hook,
        cta: row.cta,
        shotCount: row.shots.length,
        language: params.language,
      };
      return {
        content: [{ type: "text", text: `已保存 ${details.type}类 ${details.duration} 秒视频脚本（${details.shotCount} 个分镜），可在「脚本」页面查看。` }],
        details,
      };
    },
  };
}

export function createSaveLiveScriptTool(deps: { shopId: string }): AgentTool<typeof liveSchema, LiveScriptToolDetails> {
  return {
    name: LIVE_SCRIPT_TOOL_NAME,
    label: "保存直播脚本",
    description:
      "把已写好的直播流程脚本存到「脚本」页面，总时长由各阶段分钟数求和得出。脚本必须先经合规扫描通过，本工具只落库。",
    parameters: liveSchema,
    async execute(_toolCallId, params: LiveParams): Promise<AgentToolResult<LiveScriptToolDetails>> {
      const totalMinutes = params.segments.reduce((sum, segment) => sum + segment.minutes, 0);
      const row = await createLiveScript({
        shopId: deps.shopId,
        duration: totalMinutes * 60,
        productNames: params.productNames ?? [],
        segments: params.segments,
      });
      const details: LiveScriptToolDetails = {
        liveScriptId: row.id,
        durationMinutes: Math.round(row.duration / 60),
        segmentCount: row.segments.length,
        productCount: row.productNames.length,
        language: "auto",
      };
      return {
        content: [{ type: "text", text: `已保存 ${details.durationMinutes} 分钟直播脚本（${details.segmentCount} 个阶段），可在「脚本」页面查看。` }],
        details,
      };
    },
  };
}
