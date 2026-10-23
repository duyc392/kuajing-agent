// 用途：内置 Skill「TikTok 爆款短视频结构拆解」——纯数据 SOP，没有 execute、不调用模型、不碰数据库。
// 被 load_skill 取回后进入主 Agent 上下文：告诉它按什么步骤调哪些原子工具、怎么判断合格、交付成什么样。
import type { AgentSkillDefinition } from "@/types";

export const videoDeconstructionSkill: AgentSkillDefinition = {
  id: "builtin:video-deconstruction",
  name: "TikTok 爆款短视频结构拆解",
  description: "卖家给出竞品或爆款视频链接，要求拉片、拆解结构、分析这条为什么火时使用",
  triggers: ["拉片", "拆解", "为什么火", "爆款结构", "竞品视频", "逐字稿", "节奏分析"],
  tools: [
    "fetch_video_source",
    "transcribe_video",
    "extract_video_frames",
    "compute_cut_rhythm",
    "verify_citations",
    "save_snapshot",
  ],
  sop: [
    "1. 确认要拆的视频链接。卖家只给了店铺名或关键词时先问清楚是哪一条，不要猜。",
    "2. 依次调用 fetch_video_source → transcribe_video → extract_video_frames：后一步用前一步返回的 assetId；三步是独立工具，缺哪一步就如实说明缺哪一步。",
    "3. 调用 compute_cut_rhythm 拿切点数量、每 10 秒切镜数与最长镜头。这些数字只能引用工具结果，禁止自己数关键帧估节奏。",
    "4. 先写时间轴骨架：每段的起止秒数与逐字稿原文引文；骨架写不出引文的段落不要编。",
    "5. 判断前 3 秒钩子类型，只能从这五类里选一个：悬念反问型 / 痛点暴击型 / 视觉冲突型 / 利益诱导型 / 身份认同型，并说明这 3 秒靠什么留住人。",
    "6. 按五段式划分：痛点共鸣 → 核心产品出场 → 卖点演示或实验 → 获得感/社会证明 → 强行动召唤(CTA)。某段在素材里不存在时明确写「该段缺失」，不要硬凑。",
    "7. BGM 与音效：工具没有提供音频特征时，写「未提供音频特征，不作判断」，禁止编造高潮切入点。",
    "8. 交付前把全部引文交给 verify_citations（corpus 传逐字稿全文）；返回 problems 就逐条改，改完再验一次。",
    "9. 卖家确认结论后调用 save_snapshot，stage 用 video-deconstruction，把本次拆解结果作为 payload 存档。",
  ],
  delivery: [
    "【时间轴骨架】段名 / 起止秒 / 逐字稿原文引文，一段一行。",
    "【钩子拆解】钩子类型 + 原文 + 这 3 秒的留人机制。",
    "【五段结构】每段：阶段名 / 时间区间 / 这段在做什么 / 支撑它的原文引文；缺失段明确标注。",
    "【节奏与视听】切镜数、每 10 秒切镜数、最长镜头（引用工具数字）；BGM 有数据才写，没有就写未提供。",
    "【可复用套路】3-5 条，每条必须能对应到上面某一具体段落。",
    "【不确定项】素材缺口、未提供的音频特征、识别不清的画面。",
  ],
  rubric: [
    { key: "hook_classified", weight: 0.2, hardGate: true, check: "code", description: "钩子类型必须在五个枚举内，且引文来自前三秒逐字稿原文" },
    { key: "five_segments", weight: 0.25, hardGate: true, check: "code", description: "五段齐全、时间单调递增、覆盖不少于 85% 的视频时长；缺失段必须显式标注" },
    { key: "evidence_verbatim", weight: 0.2, hardGate: true, check: "code", description: "每条引文都能在逐字稿里逐字找到（交给 verify_citations 复核）" },
    { key: "rhythm_grounded", weight: 0.15, hardGate: false, check: "model", description: "节奏结论与 compute_cut_rhythm 的数字一致，不得自行估算" },
    { key: "audio_honest", weight: 0.1, hardGate: true, check: "model", description: "没有音频特征时明确写「未提供音频特征」，不得编造 BGM 高潮点" },
    { key: "patterns_actionable", weight: 0.1, hardGate: false, check: "model", description: "每条可复用套路都能落到具体镜头或具体段落" },
  ],
  fewShot: [
    "合格示例（片段）：【钩子拆解】类型：痛点暴击型｜原文：「you're still charging your phone twice a day?」｜留人机制：用反问把观众自己的日常困境说出来，前 2 秒就建立「这说的就是我」的代入感，紧接着产品在 0:03 出场承接。",
    "不合格示例：写「这条视频节奏很快、BGM 很燃，所以能火」——没有引文、没有段落时间、BGM 也没有数据来源，属于凭感觉写结论，必须重做。",
  ],
  builtin: true,
  editable: false,
};
