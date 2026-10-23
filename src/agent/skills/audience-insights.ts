// 用途：内置 Skill「跨境电商受众痛点与买点提炼」——纯数据 SOP，没有 execute、不调用模型、不碰数据库。
// 主 Agent 按本 SOP 取评论、筛样本、把差评转成卖点，并用 verify_citations 硬性核对引文。
import type { AgentSkillDefinition } from "@/types";

export const audienceInsightsSkill: AgentSkillDefinition = {
  id: "builtin:audience-insights",
  name: "跨境电商受众痛点与买点提炼",
  description: "卖家要分析竞品评价、找用户痛点、把吐槽转成卖点、做受众画像时使用",
  triggers: ["差评", "评论分析", "痛点", "卖点提炼", "受众画像", "用户反馈", "口碑"],
  tools: [
    "fetch_product_reviews",
    "fetch_video_comments",
    "query_shop_knowledge_base",
    "verify_citations",
    "save_snapshot",
  ],
  sop: [
    "1. 先确认分析对象：要分析哪个商品或哪条视频。没有原始评论时，请卖家把评论粘贴过来（fetch_product_reviews 支持 reviewsText 参数），不要凭空推断用户想法。",
    "2. 调 fetch_product_reviews 取评价（重点看 1-3 星），需要看带货视频反馈时再调 fetch_video_comments。一次取不完就分批，必须记录每次取到的样本量。",
    "3. 先读工具返回的 stats（去重后条数 / 垃圾条数 / 星级分布），样本分母一律用工具给的数字，禁止用页面上的总评论数。",
    "4. 把差评归类成痛点簇（续航、质量、说明书语言、尺寸、气味、物流、售后…）。每簇至少要有 2 条原文引文才能成立。",
    "5. 每条痛点反推一个卖点：一句中文讲清「用什么设计解决什么抱怨」，再给一句目标语言的口语表达。",
    "6. 地域适配只写市场级通用倾向：北美更看重效率与悦己，东南亚更看重性价比与耐用；禁止编造人群比例、年龄分布等没有数据来源的数字。",
    "7. 5 星好评只用来提炼「用户真正在夸什么」，不能当作痛点的证据。",
    "8. 有效评论少于 20 条时降级输出，并在不确定项里明确写样本不足，不要靠想象补足。",
    "9. 交付前把所有引文交给 verify_citations（corpus 传全部评论原文）；确认后保存快照，stage 用 audience-insights。",
  ],
  delivery: [
    "【样本说明】评价条数 / 留言条数 / 过滤掉的灌水条数 / 星级分布。",
    "【受众画像】是谁 / 什么场景下用 / 什么触发点让他下单；每条结论都要有原文支撑。",
    "【痛点清单】每条：编号(P1…) / 用户吐槽 / 出现次数 / 严重程度 / 原文引文（至少 2 条）。",
    "【卖点转化】每条痛点对应的中文卖点 + 目标语言口语版本 + 视频里必须出现的实证画面。",
    "【地域适配】语气风格、要避开的禁忌、优先强调的诉求。",
    "【不确定项】样本不足、无法验证的假设。",
  ],
  rubric: [
    { key: "quotes_verbatim", weight: 0.25, hardGate: true, check: "code", description: "所有引文必须逐字命中原始评论（交给 verify_citations 复核）" },
    { key: "min_evidence", weight: 0.15, hardGate: true, check: "code", description: "每条痛点至少 2 条原文引文，不足就不成立" },
    { key: "pain_to_point", weight: 0.25, hardGate: false, check: "model", description: "卖点必须直接解掉对应痛点，不能是「品质好」「超值」这类空话" },
    { key: "locale_fit", weight: 0.15, hardGate: false, check: "model", description: "目标语言表达是当地口语，不是中式直译" },
    { key: "sample_honesty", weight: 0.1, hardGate: true, check: "code", description: "样本数字必须与工具 stats 一致，不得使用页面总评论数当分母" },
    { key: "no_fabricated_data", weight: 0.1, hardGate: true, check: "model", description: "不得出现工具未提供的百分比、用户数、年龄等量化断言" },
  ],
  fewShot: [
    "合格示例：P1 续航太短｜出现 23 次｜严重程度 high｜引文：「dies after like 4 hours」「battery barely lasts a shift」｜卖点：双倍电芯 + 12 小时实测续航，视频里必须出现连续计时器画面。",
    "不合格示例：写「用户普遍认为续航差」但一条原文都没给；或者写「68% 的用户是 25-34 岁女性」——样本里根本没有这个数据。",
  ],
  builtin: true,
  editable: false,
};
