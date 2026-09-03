// 用途：选品工作台服务（SPEC 6.1）：确定性假数据源（FastMoss 大盘 / 1688 采购成本 / 视频透视），过滤、财务计算、
// 生成 15~20 款候选品（23 列完整结果）与视频透视结果，提供 Agent 指令清洗纯函数。
// 真实接口在后续版本再替换，本文件只做数学与数据组装，不调模型。价格契约：计算域统一美元（cf. config/selection）。
import { getShop } from "@/services/shops.service";
import { ValidationError } from "@/lib/errors";
import { CREATOR_COMMISSION_RATE, computeDefaultFinance, refineStatusOf } from "@/config/selection";
import type { ProductDnaInput } from "@/types";
import type { RunSelectionResult, SelectionCandidate, SelectionFilterParams, SelectionRegion, SelectionScriptDraft, SelectionUiAction, VideoInsightResult, VideoInsightSection } from "@/types";

const CANDIDATE_TARGET_MIN = 15;
const CANDIDATE_TARGET_MAX = 20;

// 模板的派生变体：同源不同价格档位/增速/成本，让单类目可产出 15~20 款候选品（5 档覆盖 ±20% 价格段）。
const PRICE_VARIANTS = [
  { suffix: "", priceFactor: 1, salesFactor: 1, growthFactor: 1, costFactor: 1 },
  { suffix: " 青春版", priceFactor: 0.92, salesFactor: 1.3, growthFactor: 1.35, costFactor: 0.97 },
  { suffix: " 迷你版", priceFactor: 0.8, salesFactor: 1.6, growthFactor: 1.5, costFactor: 0.94 },
  { suffix: " Pro", priceFactor: 1.08, salesFactor: 0.85, growthFactor: 0.8, costFactor: 0.91 },
  { suffix: " 高端版", priceFactor: 1.2, salesFactor: 0.7, growthFactor: 0.65, costFactor: 0.88 },
] as const;

interface SourceTemplate {
  key: string;
  categoryValue: string;
  categoryLabel: string;
  name: string;
  emoji: string;
  sellingPoint: string;
  sourceTag: "factory" | "ali";
  weightGrams: number;
  basePrice: number;
  costRmb: number;
  monthlySales: number;
  weeklyGrowth: number;
  gmv7d: number;
  videoCount: number;
  creatorCount: number;
  shopCount: number;
  rating: string;
  categoryCr: number;
  prohibited: boolean;
  hookEn: string;
  ctaEn: string;
  painLineEn: string;
  demoLineEn: string;
  unboxLineEn: string;
  demoZh: string;
  dna: ProductDnaInput;
}

// 24 个基础模板（4 类目 × 6）：当前阶段为确定性假数据，字段标注 FastMoss 大盘/采购成本即展示口径。
const TEMPLATES: SourceTemplate[] = [
  // ===== Beauty 美妆个护 =====
  { key: "beauty-0", categoryValue: "Beauty", categoryLabel: "美妆个护", name: "智能微气泡去黑头仪", emoji: "✨", sellingPoint: "真空瞬吸显微可视化", sourceTag: "ali", weightGrams: 220, basePrice: 29.99, costRmb: 22, monthlySales: 24200, weeklyGrowth: 280, gmv7d: 725758, videoCount: 215, creatorCount: 86, shopCount: 5, rating: "4.7 ★ (94%)", categoryCr: 3.8, prohibited: false, hookEn: "Stop literally ripping your skin off! Traditional strips make pores twice as big.", ctaEn: "TikTok Shop has 40% off right now. Tap below before it sells out!", painLineEn: "Switch to this gentle vacuum instead—it lifts gunk in 3 seconds.", demoLineEn: "Look at all that gunk! Zero redness, just clean pores.", unboxLineEn: "Everything you need for weekly pore care, all in this little box.", demoZh: "显微微距下油脂瞬拔出仓，无红肿对比", dna: { targetPersona: "18-34 岁易长黑头女性", useScenarios: "睡前浴室洁面后去黑头", coreSellingPoints: "替代撕拉鼻贴不伤毛孔，真空瞬吸", visualHooks: "显微油脂拔出透明仓", recommendedFormats: "素人口播实测 + 对比", competitorDifferences: "显微镜可视化进程，无刺激不撕拉" } },
  { key: "beauty-1", categoryValue: "Beauty", categoryLabel: "美妆个护", name: "LED 三档光子美容仪", emoji: "💡", sellingPoint: "三档光疗提拉紧致", sourceTag: "factory", weightGrams: 180, basePrice: 24.99, costRmb: 15, monthlySales: 18500, weeklyGrowth: 190, gmv7d: 462150, videoCount: 168, creatorCount: 61, shopCount: 7, rating: "4.6 ★ (91%)", categoryCr: 3.1, prohibited: true, hookEn: "Your tired skin showed up at work again? Today we fix that.", ctaEn: "Link in bio and tap the cart—today only $24.99.", painLineEn: "This little pen uses blue light to calm redness in 3 minutes.", demoLineEn: "Watch the skin texture change on the left half of her face.", unboxLineEn: "One pen, three light modes, and a week of visible fresher skin.", demoZh: "三档光疗对比半脸，肤色提亮", dna: { targetPersona: "25-40 岁熬夜上班族女性", useScenarios: "晚间护肤、出差便携护理", coreSellingPoints: "三档光疗、提拉紧致、便携", visualHooks: "半脸灯光对比", recommendedFormats: "对比 + 教程", competitorDifferences: "灯珠数量翻倍且带震动导入" } },
  { key: "beauty-2", categoryValue: "Beauty", categoryLabel: "美妆个护", name: "卷发棒直卷两用", emoji: "🌀", sellingPoint: "30 秒直卷切换", sourceTag: "ali", weightGrams: 260, basePrice: 21.99, costRmb: 16.5, monthlySales: 30600, weeklyGrowth: 240, gmv7d: 672894, videoCount: 285, creatorCount: 110, shopCount: 9, rating: "4.5 ★ (89%)", categoryCr: 3.9, prohibited: false, hookEn: "Half your hair straight, half curled—this glows in 30 seconds.", ctaEn: "Tap the cart now and get the free heat-glove set.", painLineEn: "No more packing two tools for every trip.", demoLineEn: "One button flips it from straightener to curler instantly.", unboxLineEn: "Lightweight, dual-voltage, and ready for a full glam session.", demoZh: "直卷一键切换，半直半卷演示", dna: { targetPersona: "20-35 岁通勤女性", useScenarios: "出门前快速造型、旅行携带", coreSellingPoints: "直卷二合一、30 秒升温、双电压", visualHooks: "半直半卷对比", recommendedFormats: "开箱 + 上手法", competitorDifferences: "涂层面板更顺滑且带防烫衣链" } },
  { key: "beauty-3", categoryValue: "Beauty", categoryLabel: "美妆个护", name: "美睫睫毛夹加热器", emoji: "👁️", sellingPoint: "45 秒定型全天翘", sourceTag: "ali", weightGrams: 90, basePrice: 22.99, costRmb: 13, monthlySales: 15800, weeklyGrowth: 160, gmv7d: 364000, videoCount: 132, creatorCount: 47, shopCount: 12, rating: "4.6 ★ (92%)", categoryCr: 2.7, prohibited: false, hookEn: "Do your lashes fall flat by noon? Meet your new morning secret.", ctaEn: "Tap below and never buy a lash curler again.", painLineEn: "Three seconds on each eye with this heated comb and curls hold all day.", demoLineEn: "Before, after, 6 hours later—still sealed.", unboxLineEn: "Runs one week on one charge, fits any makeup pouch.", demoZh: "热敷卷翘前后变化与 6 小时持妆对比", dna: { targetPersona: "16-30 岁学生与通勤女性", useScenarios: "晨间化妆快速定型", coreSellingPoints: "45 秒定型持妆整日", visualHooks: "6 小时前后对比", recommendedFormats: "before/after 对比", competitorDifferences: "充电版替代一次性睫毛夹" } },
  { key: "beauty-4", categoryValue: "Beauty", categoryLabel: "美妆个护", name: "电动修眉笔套装", emoji: "✏️", sellingPoint: "一键修出对称眉形", sourceTag: "factory", weightGrams: 120, basePrice: 21.99, costRmb: 10.5, monthlySales: 12900, weeklyGrowth: 130, gmv7d: 283700, videoCount: 96, creatorCount: 34, shopCount: 6, rating: "4.4 ★ (87%)", categoryCr: 2.4, prohibited: false, hookEn: "Brow blindness is real—and this little pen fixed mine in 2 strokes.", ctaEn: "Grab yours before restock, tap the yellow cart below.", painLineEn: "Just trace the guide and both brows match with no mirror stress.", demoLineEn: "See how it glides instead of dragging, leaving clean edges.", unboxLineEn: "Comes with 3 brow heads, a mirror, and a travel pouch.", demoZh: "沿线修眉画出对称眉形", dna: { targetPersona: "18-45 岁化妆小白", useScenarios: "晨间化妆或旅行补眉", coreSellingPoints: "一键对称眉形、修眉不痛", visualHooks: "不对称眉→对称眉对比", recommendedFormats: "教程对比", competitorDifferences: "内置眉形尺与可换刀头" } },
  { key: "beauty-5", categoryValue: "Beauty", categoryLabel: "美妆个护", name: "冷凝胶面膜碗套装", emoji: "🧴", sellingPoint: "夏日冰感敷脸降红", sourceTag: "ali", weightGrams: 380, basePrice: 23.99, costRmb: 12.5, monthlySales: 9800, weeklyGrowth: 95, gmv7d: 235000, videoCount: 78, creatorCount: 29, shopCount: 15, rating: "4.5 ★ (90%)", categoryCr: 2.2, prohibited: false, hookEn: "Summer redness spiked? This gel mask set is the fastest cool-down.", ctaEn: "Tap below—introducing 30% off for first orders.", painLineEn: "Chill the bowl, mix the gel, and your face cools in a minute.", demoLineEn: "Water-like texture, no sting, absorbs fully by minute 10.", unboxLineEn: "Bowl, brush, spatula and a week of gel packets inside.", demoZh: "冰箱取出搅拌上脸，冰感示意", dna: { targetPersona: "20-35 岁敏感肌女性", useScenarios: "晒后修复与睡前补水", coreSellingPoints: "冰感降红、一贴不滴", visualHooks: "冰感雾气翻腾", recommendedFormats: "素人/教程", competitorDifferences: "含洋甘菊成分不刺激" } },
  // ===== Home 家居厨房 =====
  { key: "home-0", categoryValue: "Home", categoryLabel: "家居厨房", name: "迷你热压便携封口机", emoji: "🥪", sellingPoint: "零食吃不完一秒密封", sourceTag: "factory", weightGrams: 120, basePrice: 18.99, costRmb: 9.5, monthlySales: 19000, weeklyGrowth: 190, gmv7d: 360810, videoCount: 140, creatorCount: 62, shopCount: 4, rating: "4.6 ★ (91%)", categoryCr: 3.2, prohibited: false, hookEn: "Your chips go stale the same night—seal them in one second.", ctaEn: "Tap the yellow cart and keep every snack fresh.", painLineEn: "This mini heat sealer presses, seals, and cuts in a single slide.", demoLineEn: "Watch it lock the bag airtight with zero leftover crumbs.", unboxLineEn: "Small enough for a drawer, works with any plastic bag.", demoZh: "一划封口，零食袋反向滴水测试", dna: { targetPersona: "宝妈与零食党", useScenarios: "厨房收纳与零食保鲜", coreSellingPoints: "一秒封口、袋装通用、随身携带", visualHooks: "反手倒水不洒", recommendedFormats: "开箱 + 测评", competitorDifferences: "带收纳卡扣且可充电" } },
  { key: "home-1", categoryValue: "Home", categoryLabel: "家居厨房", name: "多功能磁吸浴室置物架", emoji: "🧺", sellingPoint: "免打孔磁吸稳挂", sourceTag: "ali", weightGrams: 320, basePrice: 24.99, costRmb: 13, monthlySales: 14400, weeklyGrowth: 150, gmv7d: 359856, videoCount: 118, creatorCount: 44, shopCount: 8, rating: "4.5 ★ (88%)", categoryCr: 2.9, prohibited: false, hookEn: "Is your bathroom shelf drowning in bottles? Try a shelf that snaps on.", ctaEn: "Tap below—free stickers for your first order.", painLineEn: "No drill, no wall damage: magnetic snap and it holds up to 20 lb.", demoLineEn: "See how the drain tray catches water and stays rust-free.", unboxLineEn: "Three pieces, two install styles, and 5 minutes of setup.", demoZh: "磁吸吸附钢门，承重挂物演示", dna: { targetPersona: "租房与收纳整理人群", useScenarios: "浴室/厨房墙面收纳", coreSellingPoints: "免打孔磁吸、承重 20 磅", visualHooks: "单手拍上墙", recommendedFormats: "开箱 + 收纳教程", competitorDifferences: "沥水托盘防锈且磁吸更强" } },
  { key: "home-2", categoryValue: "Home", categoryLabel: "家居厨房", name: "切蒜器手动按压", emoji: "🧄", sellingPoint: "压一下碎成蒜泥", sourceTag: "ali", weightGrams: 200, basePrice: 19.99, costRmb: 8.5, monthlySales: 21800, weeklyGrowth: 210, gmv7d: 435700, videoCount: 176, creatorCount: 68, shopCount: 11, rating: "4.6 ★ (90%)", categoryCr: 3.5, prohibited: false, hookEn: "Chopping garlic for every dish? One press and it's done.", ctaEn: "Tap the cart—cheap enough to gift to every home chef.", painLineEn: "Chop ginger, garlic, onion and chili with one clean press.", demoLineEn: "Watch it turn a whole clove into fine minced paste in 2 seconds.", unboxLineEn: "Easy-clean bladed bowl, dishwasher safe, no smell on hands.", demoZh: "两压成泥，刀刃拆洗", dna: { targetPersona: "爱做饭的独居年轻人", useScenarios: "备菜切蒜/姜/辣椒", coreSellingPoints: "一压成泥、多菜通用、易清洗", visualHooks: "整蒜瞬间成泥", recommendedFormats: "演示 + 吐槽", competitorDifferences: "双层刀片且防滑手柄" } },
  { key: "home-3", categoryValue: "Home", categoryLabel: "家居厨房", name: "桌面升降收纳托盘", emoji: "🗃️", sellingPoint: "垂直收纳桌面清空", sourceTag: "factory", weightGrams: 460, basePrice: 21.99, costRmb: 11, monthlySales: 8700, weeklyGrowth: 110, gmv7d: 191313, videoCount: 74, creatorCount: 26, shopCount: 5, rating: "4.4 ★ (86%)", categoryCr: 2.1, prohibited: false, hookEn: "Your desk is full again? Stack up and take your space back.", ctaEn: "Tap the link and reclaim your whole desk this weekend.", painLineEn: "Two tiers slide and lift so every cup and cable has a spot.", demoLineEn: "Pull the handle and the top tray rises; twist to lock it.", unboxLineEn: "Ships flat, snaps into place—no screws, no tools.", demoZh: "抽拉升降两层收纳演示", dna: { targetPersona: "居家办公人群", useScenarios: "书桌/厨房台面收纳", coreSellingPoints: "双层升降、免工具安装", visualHooks: "一拉升高一扭锁定", recommendedFormats: "开箱 + 收纳对比", competitorDifferences: "圆角防撞木质纹面" } },
  { key: "home-4", categoryValue: "Home", categoryLabel: "家居厨房", name: "折叠硅胶沥水篮", emoji: "🍽️", sellingPoint: "按一按变挂篮", sourceTag: "ali", weightGrams: 150, basePrice: 21.99, costRmb: 9.5, monthlySales: 11200, weeklyGrowth: 140, gmv7d: 246300, videoCount: 95, creatorCount: 39, shopCount: 10, rating: "4.5 ★ (89%)", categoryCr: 2.6, prohibited: false, hookEn: "Sink full again? Fold a draining basket out of nothing.", ctaEn: "Tap below and save $8 today with code at checkout.", painLineEn: "Stretch it open over the faucet, clip it, and rinse everything at once.", demoLineEn: "Wet veggies go in, water drains out the bottom springs.", unboxLineEn: "Food grade silicone, collapses flat to fit any drawer.", demoZh: "展开夹水龙头冲洗蔬菜水果", dna: { targetPersona: "厨房常做饭家庭", useScenarios: "清洗果蔬、沥水收纳", coreSellingPoints: "秒开秒收、软胶不伤碗", visualHooks: "一按变薄塞抽屉", recommendedFormats: "场景演示", competitorDifferences: "底部弹簧水孔不堵" } },
  { key: "home-5", categoryValue: "Home", categoryLabel: "家居厨房", name: "智能感应夜灯", emoji: "🌙", sellingPoint: "人走过就亮不刺眼", sourceTag: "factory", weightGrams: 90, basePrice: 23.99, costRmb: 10, monthlySales: 26500, weeklyGrowth: 170, gmv7d: 635600, videoCount: 189, creatorCount: 72, shopCount: 13, rating: "4.7 ★ (95%)", categoryCr: 3.6, prohibited: false, hookEn: "Every 2am trip to the kitchen wakes the whole house—not anymore.", ctaEn: "Tap the cart and sleep like the hallway is a nightlight.", painLineEn: "Humanized sensor: lights up when you pass, dims when you sleep.", demoLineEn: "Watch it react with soft warm light and zero switch noise.", unboxLineEn: "Rechargeable, magnetic, and sticks anywhere in seconds.", demoZh: "夜间人经过点亮、离开渐灭", dna: { targetPersona: "有娃家庭与宿舍党", useScenarios: "走廊/床边/衣柜夜间照明", coreSellingPoints: "感应即亮、柔和暖光", visualHooks: "屋内夜行全程无感", recommendedFormats: "场景剧 + 评测", competitorDifferences: "三档色温与磁吸充电" } },
  // ===== 3C 数码配件 =====
  { key: "3c-0", categoryValue: "3C", categoryLabel: "3C数码", name: "自动卷线充电器", emoji: "🔌", sellingPoint: "一拉即收瞬间回弹", sourceTag: "factory", weightGrams: 180, basePrice: 24.99, costRmb: 15, monthlySales: 38500, weeklyGrowth: 320, gmv7d: 962115, videoCount: 342, creatorCount: 128, shopCount: 3, rating: "4.8 ★ (96%)", categoryCr: 4.2, prohibited: false, hookEn: "Tangled cords driving you crazy while driving?", ctaEn: "TikTok Shop flash sale is live now—tap below!", painLineEn: "Switch to this 3-in-1 retractable USB-C charger.", demoLineEn: "One click retracts instantly. Super clean.", unboxLineEn: "USB-C + USB-A + Lightning: everything in one retractable cable.", demoZh: "车内电线打结到一键回弹收纳", dna: { targetPersona: "通勤车主与数码党", useScenarios: "车内应急充电、出差携带", coreSellingPoints: "一拉即收不绕线、三合一", visualHooks: "一按瞬间回弹", recommendedFormats: "痛点反转型 + 对比", competitorDifferences: "多口合一且带磁吸收纳环" } },
  { key: "3c-1", categoryValue: "3C", categoryLabel: "3C数码", name: "磁吸无线充支架", emoji: "📲", sellingPoint: "放上就充一秒吸附", sourceTag: "ali", weightGrams: 150, basePrice: 21.99, costRmb: 12, monthlySales: 21000, weeklyGrowth: 180, gmv7d: 461800, videoCount: 154, creatorCount: 58, shopCount: 6, rating: "4.6 ★ (93%)", categoryCr: 3.4, prohibited: false, hookEn: "Stop fishing for cables in your bag. Just click it on.", ctaEn: "Tap the yellow cart today—65W fast charging inside.", painLineEn: "This magnetic stand snaps to your phone and tops up in 20 minutes.", demoLineEn: "Watch the airflow run while you keep using your phone at full tilt.", unboxLineEn: "Works with every MagSafe case, desktop or bedside.", demoZh: "磁吸自动对位，边充边用", dna: { targetPersona: "iPhone 用户与办公室人群", useScenarios: "桌面/床头随放随充", coreSellingPoints: "磁吸对位、15W 快充", visualHooks: "放上去一秒对位", recommendedFormats: "开箱 + 桌面收纳", competitorDifferences: "内置散热窗且带角度调节" } },
  { key: "3c-2", categoryValue: "3C", categoryLabel: "3C数码", name: "蓝牙翻页笔", emoji: "🖱️", sellingPoint: "短视频刷屏也要隔空翻页", sourceTag: "ali", weightGrams: 40, basePrice: 19.99, costRmb: 9.5, monthlySales: 17200, weeklyGrowth: 220, gmv7d: 343800, videoCount: 138, creatorCount: 51, shopCount: 4, rating: "4.5 ★ (90%)", categoryCr: 3.7, prohibited: false, hookEn: "Swiping through 200 videos? Your thumb is on strike.", ctaEn: "Grab it today—tap the cart and set your hand free.", painLineEn: "This ring flips pages and answers calls without touching the screen.", demoLineEn: "One trigger, two gestures: page up, page down, volume on hold.", unboxLineEn: "Pocket-sized, 30-day battery, and pairs in one click.", demoZh: "戴着戒指隔空刷视频翻页", dna: { targetPersona: "重度短视频用户与主播", useScenarios: "刷视频/汇报翻页/实时互动", coreSellingPoints: "隔空翻页、音量控制", visualHooks: "手指一点翻一页", recommendedFormats: "实用演示 + 达人自拍", competitorDifferences: "体感翻页不依赖屏幕定位" } },
  { key: "3c-3", categoryValue: "3C", categoryLabel: "3C数码", name: "桌面理线收纳夹套装", emoji: "🧵", sellingPoint: "卡进去线不落地", sourceTag: "factory", weightGrams: 110, basePrice: 18.99, costRmb: 8, monthlySales: 14600, weeklyGrowth: 130, gmv7d: 277300, videoCount: 112, creatorCount: 41, shopCount: 9, rating: "4.4 ★ (88%)", categoryCr: 2.8, prohibited: false, hookEn: "Is your desk grid full of snakes? Tame it for $13.", ctaEn: "Tap below and get the full 8-clip set plus a free cable sleeve.", painLineEn: "Each clip grabs three cables, so a whole desk gets clean in minutes.", demoLineEn: "Watch it turn a nightmare cable pile into two neat rows.", unboxLineEn: "Self-adhesive back, screws included, fits any edge.", demoZh: "凌乱线缆→卡入夹子整排归位", dna: { targetPersona: "居家办公与电竞桌搭", useScenarios: "桌面理线、桌上电器收纳", coreSellingPoints: "三线一夹、免钉贴壁", visualHooks: "一夹两整排", recommendedFormats: "收纳前后对比", competitorDifferences: "轨道可滑动式理线槽" } },
  { key: "3c-4", categoryValue: "3C", categoryLabel: "3C数码", name: "车载手机磁吸支架", emoji: "🚗", sellingPoint: "颠簸路面纹丝不晃", sourceTag: "ali", weightGrams: 130, basePrice: 21.99, costRmb: 11, monthlySales: 23100, weeklyGrowth: 240, gmv7d: 508000, videoCount: 187, creatorCount: 74, shopCount: 7, rating: "4.7 ★ (94%)", categoryCr: 4.1, prohibited: false, hookEn: "Is your phone flying through bumps on the highway?", ctaEn: "Tap the cart—solid enough for a rally car.", painLineEn: "Six magnets clamp tight while you glance, never while you drive.", demoLineEn: "Watch it survive our pothole test with zero drops and zero scratches.", unboxLineEn: "Air vent, dashboard and suction cup—all three mounts inside.", demoZh: "颠簸路面手机牢牢吸附", dna: { targetPersona: "网约车司机与通勤车主", useScenarios: "导航/接单时手机取放", coreSellingPoints: "六磁吸附、三种安装", visualHooks: "颠簸路面测试", recommendedFormats: "极限测试 + 对比", competitorDifferences: "磁力翻倍带防滑硅胶圈" } },
  { key: "3c-5", categoryValue: "3C", categoryLabel: "3C数码", name: "充电宝自带线 20000mAh", emoji: "🔋", sellingPoint: "自带线充手机还能充电脑", sourceTag: "factory", weightGrams: 320, basePrice: 27.99, costRmb: 18, monthlySales: 19900, weeklyGrowth: 150, gmv7d: 557001, videoCount: 143, creatorCount: 55, shopCount: 14, rating: "4.5 ★ (91%)", categoryCr: 3.3, prohibited: true, hookEn: "Forgot your cable AGAIN? This pack never asks forgiveness.", ctaEn: "Tap below—free travel sleeve included tonight only.", painLineEn: "Cables built in, 20000mAh inside: phone, earbuds, and ultrabook.", demoLineEn: "Count along: one phone, one tablet, one laptop, all charged.", unboxLineEn: "4-in-1: USB-C, Lightning, micro, and a spare USB-A out.", demoZh: "自带双线一次充三台设备", dna: { targetPersona: "高频出差人群与数码玩家", useScenarios: "机场/酒店应急补电", coreSellingPoints: "自带线 20000mAh、多设备", visualHooks: "三台设备同时充电", recommendedFormats: "开箱 + 实测", competitorDifferences: "机身更薄且支持 laptop PD" } },
  // ===== Outdoor 户外运动 =====
  { key: "outdoor-0", categoryValue: "Outdoor", categoryLabel: "户外运动", name: "迷你露营折叠凳", emoji: "🪑", sellingPoint: "半公斤凳承重百斤", sourceTag: "factory", weightGrams: 480, basePrice: 22.99, costRmb: 13, monthlySales: 12800, weeklyGrowth: 160, gmv7d: 294272, videoCount: 104, creatorCount: 38, shopCount: 5, rating: "4.6 ★ (92%)", categoryCr: 2.9, prohibited: false, hookEn: "Camping without a chair? 490 grams says yes to the hike.", ctaEn: "Tap the cart and take everything you need, carry nothing heavy.", painLineEn: "This stool pops open and holds a 100 kg friend, thanks to X-legs.", demoLineEn: "Side by side on a rock: this one snaps flat into a pocket pod.", unboxLineEn: "Carry bag, aluminum frame, and a 5-second setup.", demoZh: "百斤承重测试，折叠收纳进背包", dna: { targetPersona: "轻量露营与钓鱼人群", useScenarios: "徒步小憩、野钓、音乐节", coreSellingPoints: "490g 便携、X 腿承重百斤", visualHooks: "单手按开一分钟收起", recommendedFormats: "极限承重 + 场景演示", competitorDifferences: "腿部加粗且带防陷脚垫" } },
  { key: "outdoor-1", categoryValue: "Outdoor", categoryLabel: "户外运动", name: "便携电解质运动水壶", emoji: "🥤", sellingPoint: "一瓶调好电解质", sourceTag: "ali", weightGrams: 220, basePrice: 19.99, costRmb: 8.5, monthlySales: 16700, weeklyGrowth: 200, gmv7d: 333900, videoCount: 121, creatorCount: 52, shopCount: 8, rating: "4.5 ★ (89%)", categoryCr: 3.1, prohibited: false, hookEn: "Your 2pm gym slump isn't lack of sleep. It's electrolytes.", ctaEn: "Tap below and hydrate like a pro this month.", painLineEn: "Lift the cap, shake the silver ball, and the drink is ready in 10 seconds.", demoLineEn: "Check how clear it stays: no foam, no grit, no powder lumps.", unboxLineEn: "Three flavor stands, one shaker, and a carry loop for your keys.", demoZh: "摇 10 秒溶解，无结块", dna: { targetPersona: "健身与轻户外人群", useScenarios: "健身房/骑行/徒步补水", coreSellingPoints: "十秒化开、三口味", visualHooks: "银色摇珠滚动溶解", recommendedFormats: "健身日常 vlog + 教程", competitorDifferences: "摇珠式搅拌不残留" } },
  { key: "outdoor-2", categoryValue: "Outdoor", categoryLabel: "户外运动", name: "多功能登山扣手电", emoji: "🔦", sellingPoint: "手电扣手环一体", sourceTag: "ali", weightGrams: 95, basePrice: 21.99, costRmb: 11.5, monthlySales: 11400, weeklyGrowth: 145, gmv7d: 250700, videoCount: 97, creatorCount: 35, shopCount: 12, rating: "4.4 ★ (87%)", categoryCr: 2.5, prohibited: false, hookEn: "Dark hike? Your keys already match the right tool.", ctaEn: "Tap the cart and never fumble for a flashlight again.", painLineEn: "This carabiner clips and shines 500 lumens straight ahead.", demoLineEn: "Clip it to your bag, storm it in the rain—it just keeps light.", unboxLineEn: "Seven lights in one: main, SOS, red night-vision mode.", demoZh: "黑暗中一扣亮起 500 流明", dna: { targetPersona: "徒步露营与夜骑人群", useScenarios: "夜行照明、通勤穿扣", coreSellingPoints: "扣环照明一体、500 流明", visualHooks: "夜里扣包上自动常亮", recommendedFormats: "夜穿演示 + 强度测试", competitorDifferences: "内置应急爆闪与磁吸头" } },
  { key: "outdoor-3", categoryValue: "Outdoor", categoryLabel: "户外运动", name: "露营天幕防雨棚", emoji: "⛺", sellingPoint: "三人撑开阻雨不积水", sourceTag: "factory", weightGrams: 500, basePrice: 29.99, costRmb: 19.5, monthlySales: 8900, weeklyGrowth: 120, gmv7d: 266911, videoCount: 83, creatorCount: 31, shopCount: 6, rating: "4.5 ★ (90%)", categoryCr: 2.3, prohibited: false, hookEn: "Rain canceled your campsite? Not anymore.", ctaEn: "Tap below—full crew tested, waterproof guaranteed this week.", painLineEn: "This 20x30 ft canopy keeps 3 people dry through a downpour.", demoLineEn: "Watch the runner drop a 2-hour storm without a single leak.", unboxLineEn: "Weighs 3.4 kg with pole set: less than the gas stove.", demoZh: "雨中三人坐棚内零漏水", dna: { targetPersona: "家庭露营与团队出游", useScenarios: "野餐遮蔽、雨季露营", coreSellingPoints: "防水 3000mm、3 分钟开张", visualHooks: "大雨中干爽特写", recommendedFormats: "暴雨实测 + 搭建教学", competitorDifferences: "顶部导雨槽不积水" } },
  { key: "outdoor-4", categoryValue: "Outdoor", categoryLabel: "户外运动", name: "跑步腰包发光带", emoji: "🏃", sellingPoint: "夜跑发光不晃眼", sourceTag: "ali", weightGrams: 140, basePrice: 22.99, costRmb: 9.5, monthlySales: 15300, weeklyGrowth: 175, gmv7d: 351800, videoCount: 129, creatorCount: 49, shopCount: 10, rating: "4.6 ★ (91%)", categoryCr: 3.0, prohibited: false, hookEn: "Running at 6am? Cars won't see you in the dark.", ctaEn: "Tap below and light up your next run tonight.", painLineEn: "A 360° LED band with a pocket that holds your phone and keys.", demoLineEn: "You bounce, it stays; rain, it keeps glowing soft and bright.", unboxLineEn: "USB-C charge, silicone buckle, washable band.", demoZh: "夜跑发光三视角环绕展示", dna: { targetPersona: "晨夜跑与骑行人群", useScenarios: "低光路跑步安全警示", coreSellingPoints: "360° 反光、防水口袋", visualHooks: "黑暗中腰部光带", recommendedFormats: "夜跑 vlog + 安全测评", competitorDifferences: "双面灯珠可见度翻倍" } },
  { key: "outdoor-5", categoryValue: "Outdoor", categoryLabel: "户外运动", name: "钓鱼打窝诱饵球器", emoji: "🎣", sellingPoint: "隔空 30 米打窝", sourceTag: "ali", weightGrams: 210, basePrice: 19.99, costRmb: 9, monthlySales: 9600, weeklyGrowth: 105, gmv7d: 191900, videoCount: 88, creatorCount: 27, shopCount: 16, rating: "4.3 ★ (85%)", categoryCr: 2.0, prohibited: false, hookEn: "Lure them from 30 meters, not 3.", ctaEn: "Tap the cart and cast your bait like a pro today.", painLineEn: "Load, swing, and the ball drops exactly where you aimed.", demoLineEn: "See the arc—small lake, big results in one cast.", unboxLineEn: "Holds up to 300 g bait and opens on impact.", demoZh: "打窝球入水散开一粒粒下窝", dna: { targetPersona: "钓鱼老手与新手用户", useScenarios: "野钓精准打窝", coreSellingPoints: "30 米精度打窝、开饵即散", visualHooks: "抛物线在目标点爆开", recommendedFormats: "测评 + 口诀教学", competitorDifferences: "延迟开壳不惊鱼" } },
];

// 模板派生变体 → 候选品（固定价格档位/增速曲线，数据确定性可复现，计算域统一美元）。
function deriveCandidates(template: SourceTemplate, region: SelectionRegion): SelectionCandidate[] {
  return PRICE_VARIANTS.map((variant, variantIndex) => deriveOneCandidate({ template, variant, variantIndex, region }));
}

// 单个变体派生入参：模板 + 档位系数 + 档位序号 + 目标市场。
interface CandidateDeriveInput {
  template: SourceTemplate;
  variant: (typeof PRICE_VARIANTS)[number];
  variantIndex: number;
  region: SelectionRegion;
}

// 变体市场数据列：销量/增速/GMV/视频数/达人数按档位系数缩放（确定性可复现）。
function marketColumnsOf(input: { template: SourceTemplate; variant: (typeof PRICE_VARIANTS)[number] }): Pick<SelectionCandidate, "monthlySales" | "weeklyGrowth" | "gmv7d" | "videoCount" | "creatorCount"> {
  const { template, variant } = input;
  return {
    monthlySales: Math.round(template.monthlySales * variant.salesFactor),
    weeklyGrowth: Math.round(template.weeklyGrowth * variant.growthFactor),
    gmv7d: Number((template.gmv7d * variant.salesFactor).toFixed(0)),
    videoCount: Math.round(template.videoCount * variant.salesFactor),
    creatorCount: Math.round(template.creatorCount * variant.salesFactor),
  };
}

// 单个变体候选：价格/成本按档位折算 → 统一财务精算 → 市场列缩放 → 决策状态（阈值见 config SELECTION_DEFAULTS）。
function deriveOneCandidate(input: CandidateDeriveInput): SelectionCandidate {
  const { template, variant, variantIndex, region } = input;
  const sellingPrice = Number((template.basePrice * variant.priceFactor).toFixed(2));
  const costRmb = Number((template.costRmb * variant.costFactor).toFixed(2));
  const finance = computeDefaultFinance({ region, sellingPrice, costRmb, weightGrams: template.weightGrams });
  const market = marketColumnsOf({ template, variant });
  const status = refineStatusOf({ netProfit: finance.netProfit, netMarginRate: finance.netMarginRate, weeklyGrowth: market.weeklyGrowth });
  return {
    candidateId: `tpl-${template.key}-v${variantIndex}`,
    isSelected: status === "建议测品",
    targetRegion: region,
    name: `${template.name}${variant.suffix}`,
    emoji: template.emoji,
    sellingPoint: template.sellingPoint,
    sourceTag: template.sourceTag,
    category: template.categoryLabel,
    ...market,
    shopCount: template.shopCount,
    ratingScore: template.rating,
    categoryCr: template.categoryCr,
    sellingPrice,
    costRmb,
    costEdited: false,
    weightGrams: template.weightGrams,
    shippingFee: finance.shippingFee,
    shippingSimulated: region !== "US",
    platformFee: finance.platformFee,
    creatorComm: finance.creatorComm,
    refundReserve: finance.refundReserve,
    netProfit: finance.netProfit,
    netMarginRate: finance.netMarginRate,
    maxCpa: finance.maxCpa,
    breakevenRoas: finance.breakevenRoas,
    status,
    commissionRate: CREATOR_COMMISSION_RATE,
    dna: { ...template.dna },
    builtInScripts: buildBuiltInScripts(template),
  };
}

// 3 篇内置脚本草稿（种草/教程/开箱）：时长严格等于分镜秒数和，分镜含画面/口播/字幕（假数据阶段确定性文案）。
function buildBuiltInScripts(template: SourceTemplate): SelectionScriptDraft[] {
  const chinese = (english: string): string => english.trim();
  return [
    {
      type: "种草",
      duration: 20,
      hook: template.hookEn,
      cta: template.ctaEn,
      style: null,
      shots: [
        { scene: "痛点开场特写", voiceover: template.hookEn, subtitle: chinese(template.hookEn), seconds: 3 },
        { scene: "拿出产品与旧方式对比", voiceover: template.painLineEn, subtitle: chinese(template.painLineEn), seconds: 5 },
        { scene: template.demoZh, voiceover: template.demoLineEn, subtitle: chinese(template.demoLineEn), seconds: 8 },
        { scene: "指向小黄车折扣标", voiceover: template.ctaEn, subtitle: chinese(template.ctaEn), seconds: 4 },
      ],
    },
    {
      type: "教程",
      duration: 15,
      hook: template.hookEn,
      cta: template.ctaEn,
      style: null,
      shots: [
        { scene: "产品摆台开场", voiceover: template.hookEn, subtitle: chinese(template.hookEn), seconds: 3 },
        { scene: "逐步演示第一步", voiceover: template.painLineEn, subtitle: chinese(template.painLineEn), seconds: 5 },
        { scene: template.demoZh, voiceover: template.demoLineEn, subtitle: chinese(template.demoLineEn), seconds: 5 },
        { scene: "成品效果与挂车", voiceover: template.ctaEn, subtitle: chinese(template.ctaEn), seconds: 2 },
      ],
    },
    {
      type: "开箱",
      duration: 15,
      hook: template.hookEn,
      cta: template.ctaEn,
      style: null,
      shots: [
        { scene: "包裹放入镜头", voiceover: template.hookEn, subtitle: chinese(template.hookEn), seconds: 3 },
        { scene: "打开包装取出产品", voiceover: template.unboxLineEn, subtitle: chinese(template.unboxLineEn), seconds: 5 },
        { scene: template.demoZh, voiceover: template.demoLineEn, subtitle: chinese(template.demoLineEn), seconds: 5 },
        { scene: "收起挂车提示", voiceover: template.ctaEn, subtitle: chinese(template.ctaEn), seconds: 2 },
      ],
    },
  ];
}

function templateByCandidateId(candidateId: string): SourceTemplate | null {
  const match = /^tpl-((?:beauty|home|3c|outdoor)-\d+)-v\d+$/i.exec(candidateId);
  if (!match) return null;
  const key = match[1].toLowerCase();
  return TEMPLATES.find((template) => template.key === key) ?? null;
}

// 模板层硬过滤：类目/重量/禁电禁液；价格过滤在下层变体（按实际售价区间判断）。
function hardFiltersMatch(template: SourceTemplate, filters: SelectionFilterParams): boolean {
  if (template.categoryValue !== filters.targetCategory) return false;
  if (template.weightGrams > filters.maxWeightGrams) return false;
  if (filters.isProhibitedGoodsExcluded && template.prohibited) return false;
  return true;
}

// 候选严格按用户毛利率与硬条件过滤：不足 15 款如实返回（结果越少说明条件越严，不允许暗中降低标准）。
export async function runSelection(input: { shopId: string; filters: SelectionFilterParams }): Promise<RunSelectionResult> {
  const { shopId, filters } = input;
  // 店铺校验与隔离入口：选品运行与当前店铺绑定（候选品不落库，但审批与生成必须挂在店铺之下）。
  await getShop(shopId);
  const pool: SelectionCandidate[] = [];
  for (const template of TEMPLATES) {
    if (!hardFiltersMatch(template, filters)) continue;
    pool.push(
      ...deriveCandidates(template, filters.targetRegion).filter(
        (candidate) =>
          candidate.sellingPrice >= filters.priceRange.min && candidate.sellingPrice <= filters.priceRange.max,
      ),
    );
  }
  const strict = pool.filter((candidate) => candidate.netMarginRate >= filters.minMarginRate);
  return {
    generatedAt: new Date().toISOString(),
    candidates: strict.slice(0, CANDIDATE_TARGET_MAX),
    // 提示：筛选条件过严导致候选数量偏少（自然语言提示词当前仅留痕，不参与筛选）。
    note: strict.length < CANDIDATE_TARGET_MIN ? "当前筛选条件较严，仅命中少数候选品；如需要更多结果请放宽售价区间或毛利率下限。" : undefined,
  };
}

// 4 节点关键帧（SPEC 2.1）：0.5s Hook / 4s 进品 / 9s 演示 / 16s 挂车，时间轴覆盖 20 秒参考视频；演示段描述按模板差异化。
function keyframesOf(template: SourceTemplate): Array<Omit<VideoInsightSection, "englishLine">> {
  return [
    { phase: "hook", timeRange: "00:00 - 00:03", keyframeDescription: "痛点开场特写（关键帧 0.5s）" },
    { phase: "intro", timeRange: "00:04 - 00:08", keyframeDescription: "拿出产品对齐痛点（关键帧 4s）" },
    { phase: "demo", timeRange: "00:09 - 00:15", keyframeDescription: `${template.demoZh}（关键帧 9s）` },
    { phase: "cta", timeRange: "00:16 - 00:20", keyframeDescription: "手指指向小黄车（关键帧 16s）" },
  ];
}

// 视频深度透视：按候选品模板生成 4 节点关键帧 + 原声台词 + 8 维事实（确定性模拟，未接真实视频/Whisper）。
// candidateId 必须来自候选品池（形如 tpl-<类目>-<序号>-v<档位>），未知 ID 直接报错，不静默用无关模板；
// videoUrl 是真实视频源替换点（接入 Whisper/关键帧接口后由此拉取），当前确定性模拟仅校验地址形态。
export function getVideoInsight(candidateId: string, videoUrl: string): VideoInsightResult {
  const template = templateByCandidateId(candidateId);
  if (!template) throw new ValidationError("未找到该候选品的视频透视数据，请重新运行选品流水线");
  if (!/^https?:\/\/\S+$/.test(videoUrl)) throw new ValidationError("视频地址必须为 http(s) 链接");
  const lines = [template.hookEn, template.painLineEn, template.demoLineEn, template.ctaEn];
  const sections: VideoInsightSection[] = keyframesOf(template).map((frame, index) => ({ ...frame, englishLine: lines[index] }));
  const transcript = sections.map((section) => `${section.timeRange} ${section.englishLine}`).join("\n");
  const objectiveFacts = [
    "叙事流派：痛点反差型",
    `前3秒动作：${template.hookEn.slice(0, 24)}...`,
    `演示动作：${template.demoZh}`,
    `核心卖点：${template.sellingPoint}`,
    `评论区痛点：${template.dna.coreSellingPoints}`,
    "挂车时机：第 16 秒",
    "拍摄形式：素人出镜口播实测",
    "预估语速：165 wpm（20 秒全部说完）",
  ];
  return { durationSeconds: 20, transcript, sections, objectiveFacts };
}

// Agent 候选池操作指令清洗（纯函数）：只保留结构合法的条目并限制数量，供 Agent 工具调用后再进入沙盒执行。
export function sanitizeCandidateActions(actions: unknown[]): SelectionUiAction[] {
  const isRecord = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null;
  const isStr = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
  const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const bounded = (value: unknown, min: number, max: number): value is number => isNum(value) && value >= min && value <= max;
  const result: SelectionUiAction[] = [];
  for (const item of actions) {
    if (!isRecord(item)) continue;
    if (item.type === "KILL_CANDIDATE" && isStr(item.candidateId)) {
      const reasonStr = typeof item.reason === "string" && item.reason.trim() !== "" ? item.reason.trim().slice(0, 100) : undefined;
      result.push({ type: "KILL_CANDIDATE", candidateId: item.candidateId, reason: reasonStr });
    } else if (item.type === "RESTORE_CANDIDATE" && isStr(item.candidateId)) {
      result.push({ type: "RESTORE_CANDIDATE", candidateId: item.candidateId });
    } else if (item.type === "HIGHLIGHT_LOW_MARGIN" && bounded(item.threshold, 0, 1)) {
      result.push({ type: "HIGHLIGHT_LOW_MARGIN", threshold: item.threshold });
    } else if (item.type === "UPDATE_CANDIDATE_COST" && isStr(item.candidateId) && bounded(item.costRmb, 0, 100000)) {
      result.push({ type: "UPDATE_CANDIDATE_COST", candidateId: item.candidateId, costRmb: item.costRmb });
    } else if (item.type === "SIMULATE_COMMISSION" && bounded(item.commissionRate, 0, 1)) {
      result.push({ type: "SIMULATE_COMMISSION", commissionRate: item.commissionRate });
    }
  }
  return result.slice(0, 8);
}

// 确保选品服务只读业务数据且带隔离键：校验店铺存在（外部数据一律从该路径取）。
export async function assertShopExists(shopId: string): Promise<void> {
  await getShop(shopId);
}
