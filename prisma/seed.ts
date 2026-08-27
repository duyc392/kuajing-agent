// 用途：演示数据填充脚本（npm run db:seed）：只在空数据库时写入 2 个店铺（各 3 个商品、每商品 2 条文案版本、对话、消息、记忆），ID 用固定字符串便于浏览器验收。
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface VariantSeed { sku: string; color: string; size: string; price: number; stock: number; }
interface CopySeed { title: string; description: string; sellingPoints: string; language: string; }
interface ProductSeed { id: string; name: string; category: string; price: number; description: string; variants: VariantSeed[]; copies: CopySeed[]; }
interface MessageSeed { role: string; content: string; toolCalls?: string; }
interface ConversationSeed { title: string; messages: MessageSeed[]; }
interface MemorySeed { category: string; content: string; }
interface ShopSeed {
  id: string; name: string; market: string; description: string;
  products: ProductSeed[]; conversations: ConversationSeed[]; memories: MemorySeed[];
}

const SHOPS: ShopSeed[] = [
  {
    id: "shop-1",
    name: "奥兰多美妆小铺",
    market: "美国",
    description: "主打 25-35 岁女性用户，天然成分个护",
    products: [
      {
        id: "prod-1-1", name: "便携式 LED 美妆镜", category: "美妆工具", price: 19.9, description: "可折叠、三档补光、USB 充电",
        variants: [
          { sku: "MZ-WH-M", color: "白色", size: "中号", price: 19.9, stock: 200 },
          { sku: "MZ-PK-M", color: "粉色", size: "中号", price: 19.9, stock: 150 },
        ],
        copies: [
          { title: "Portable LED Makeup Mirror with 3 Light Modes & Foldable Stand", description: "Compact design with three brightness levels, perfect for travel and daily touch-ups.", sellingPoints: "free shipping; 4.8-star reviews", language: "en" },
          { title: "LED Makeup Mirror – 3 Light Modes, Foldable & USB-Rechargeable", description: "Three brightness levels in a foldable mirror that charges by USB.", sellingPoints: "free shipping; 4.8-star reviews", language: "en" },
        ],
      },
      {
        id: "prod-1-2", name: "天然植物润唇膏", category: "唇部护理", price: 9.9, description: "天然蜂蜡基底，无色无香，敏感肌可用",
        variants: [
          { sku: "RG-UN-01", color: "无香", size: "标准", price: 9.9, stock: 300 },
          { sku: "RG-MT-01", color: "薄荷", size: "标准", price: 9.9, stock: 260 },
        ],
        copies: [
          { title: "Natural Plant-Based Lip Balm – Fragrance Free", description: "Plant-based oils with beeswax, gentle for sensitive skin.", sellingPoints: "natural ingredients; fragrance free", language: "en" },
          { title: "Unscented Natural Lip Balm, Beeswax Formula", description: "A simple beeswax-based balm with no added fragrance.", sellingPoints: "natural ingredients; fragrance free", language: "en" },
        ],
      },
      {
        id: "prod-1-3", name: "硅胶洁面刷", category: "洁面工具", price: 12.5, description: "食品级硅胶，两档震动，全身防水",
        variants: [
          { sku: "SB-BL-01", color: "蓝色", size: "标准", price: 12.5, stock: 180 },
          { sku: "SB-PK-01", color: "粉色", size: "标准", price: 12.5, stock: 140 },
        ],
        copies: [
          { title: "Silicone Facial Cleansing Brush – 2 Vibration Modes", description: "Food-grade silicone brush with two vibration modes.", sellingPoints: "waterproof; gentle on skin", language: "en" },
          { title: "Deep Clean Silicone Face Brush, Fully Waterproof", description: "A soft silicone brush that deep cleans without irritation.", sellingPoints: "waterproof; gentle on skin", language: "en" },
        ],
      },
    ],
    conversations: [
      {
        title: "分析美妆镜选品机会",
        messages: [
          { role: "user", content: "分析一下补光美妆镜在美国市场的机会" },
          { role: "agent", content: "补光美妆镜在美国市场有增长机会，竞争度中等，利润空间可观。（演示数据）", toolCalls: JSON.stringify([{ id: "seed-market-1", toolName: "analyze_market", label: "市场分析", args: { keywords: ["补光美妆镜"], market: "美国" }, status: "done", details: { market: "美国", category: "补光美妆镜", capacity: "需求稳定增长（演示数据）", competition: "中等（演示数据）", growth: "同比增长（演示数据）", profit: "利润空间可观（演示数据）", dataHighlights: ["搜索量持续上升", "客单价 15-25 美元"] } }]) },
          { role: "user", content: "那帮我为这个商品生成一版英文文案" },
          { role: "agent", content: "已生成文案草稿，可到商品详情页的文案历史查看。（演示数据）" },
        ],
      },
      {
        title: "为润唇膏写短视频脚本",
        messages: [
          { role: "user", content: "给润唇膏写一个 15 秒的种草脚本" },
          { role: "agent", content: "脚本草稿已生成，见脚本页。（演示数据）" },
        ],
      },
    ],
    memories: [
      { category: "店铺定位", content: "主打 25-35 岁女性用户，天然成分个护" },
      { category: "内容偏好", content: "喜欢简洁标题，突出 free shipping 和 reviews" },
    ],
  },
  {
    id: "shop-2",
    name: "雅加达家居优选",
    market: "东南亚-印尼",
    description: "小户型收纳与厨房好物，性价比路线",
    products: [
      {
        id: "prod-2-1", name: "可折叠收纳箱", category: "收纳用品", price: 8.5, description: "承重 15kg，折叠后仅 5cm 厚",
        variants: [
          { sku: "SN-GY-L", color: "灰色", size: "大号", price: 8.5, stock: 400 },
          { sku: "SN-BE-M", color: "米色", size: "中号", price: 6.9, stock: 350 },
        ],
        copies: [
          { title: "Kotak Penyimpanan Lipat – Ruang Lebih Rapi", description: "Kotak penyimpanan kuat yang bisa dilipat pipih.", sellingPoints: "gratis ongkir; kuat", language: "id" },
          { title: "Storage Box Lipat, Kuat & Mudah Dilipat", description: "Desain lipat hemat tempat untuk rumah kecil.", sellingPoints: "gratis ongkir; kuat", language: "id" },
        ],
      },
      {
        id: "prod-2-2", name: "硅胶保鲜盖套装", category: "厨房用品", price: 6.9, description: "6 种尺寸，适配大多数碗盘",
        variants: [
          { sku: "CV-ST-06", color: "透明", size: "6 件套", price: 6.9, stock: 500 },
          { sku: "CV-ST-12", color: "透明", size: "12 件套", price: 11.9, stock: 220 },
        ],
        copies: [
          { title: "Set Tutup Makanan Silikon – 6 Ukuran", description: "Tutup silikon lentur untuk berbagai mangkuk.", sellingPoints: "food grade; tahan lama", language: "id" },
          { title: "Tutup Silikon Anti Bocor, Aman untuk Makanan", description: "Segel rapat, bisa masuk kulkas dan microwave.", sellingPoints: "food grade; tahan lama", language: "id" },
        ],
      },
      {
        id: "prod-2-3", name: "迷你封口机", category: "厨房小工具", price: 11.0, description: "USB 充电，3 秒封口",
        variants: [
          { sku: "FS-WH-01", color: "白色", size: "标准", price: 11.0, stock: 260 },
          { sku: "FS-BK-01", color: "黑色", size: "标准", price: 11.0, stock: 200 },
        ],
        copies: [
          { title: "Mesin Sealer Mini – Kunci Kesegaran", description: "Sealer kantong mini isi ulang USB.", sellingPoints: "praktis; hemat daya", language: "id" },
          { title: "Mini Bag Sealer USB, Segarkan Camilan", description: "Rapatkan kemasan camilan dalam 3 detik.", sellingPoints: "praktis; hemat daya", language: "id" },
        ],
      },
    ],
    conversations: [
      {
        title: "印尼站收纳选品讨论",
        messages: [
          { role: "user", content: "印尼站最近哪类收纳用品在涨？" },
          { role: "agent", content: "折叠收纳箱搜索量上升，竞争度中等。（演示数据）", toolCalls: JSON.stringify([{ id: "seed-market-2", toolName: "analyze_market", label: "市场分析", args: { keywords: ["收纳用品"], market: "东南亚-印尼" }, status: "done", details: { market: "东南亚-印尼", category: "收纳用品", capacity: "小户型收纳需求增长（演示数据）", competition: "中等（演示数据）", growth: "搜索量上升（演示数据）", profit: "性价比路线利润适中（演示数据）", dataHighlights: ["折叠收纳箱搜索量上升", "客单价 5-10 美元"] } }]) },
          { role: "user", content: "好，帮我把这个结论记下来" },
        ],
      },
    ],
    memories: [
      { category: "店铺定位", content: "印尼市场，主打性价比家居好物" },
      { category: "内容偏好", content: "短视频偏好印尼语字幕，节奏偏快" },
    ],
  },
];

const VIDEO_SCRIPTS = [
  {
    id: "script-1", version: 1,
    shopId: "shop-1", productId: "prod-1-1", type: "种草", duration: 30, style: "美式快节奏种草",
    hook: "我回购了 3 次的补光镜，到底好在哪？", cta: "点击购物车，现在下单立减 5 美元",
    shots: JSON.stringify([
      { scene: "特写开箱", voiceover: "This mirror changed my makeup game.", subtitle: "This mirror changed my makeup game.", seconds: 3 },
      { scene: "三档补光演示", voiceover: "Three light modes for any lighting.", subtitle: "Three light modes for any lighting.", seconds: 10 },
      { scene: "折叠收纳", voiceover: "Folds flat for your bag.", subtitle: "Folds flat for your bag.", seconds: 7 },
      { scene: "行动号召", voiceover: "Grab yours now with $5 off.", subtitle: "Grab yours now with $5 off.", seconds: 10 },
    ]),
  },
  {
    id: "script-2", version: 1,
    shopId: "shop-2", productId: "prod-2-1", type: "开箱", duration: 15, style: "印尼语快节奏开箱",
    hook: "Kotak ini bisa dilipat?", cta: "Cek keranjang kuning sekarang",
    shots: JSON.stringify([
      { scene: "开箱", voiceover: "Buka kotak, lihat isinya.", subtitle: "Buka kotak, lihat isinya.", seconds: 3 },
      { scene: "承重演示", voiceover: "Kuat sampai 15 kilo.", subtitle: "Kuat sampai 15 kilo.", seconds: 5 },
      { scene: "折叠对比", voiceover: "Lipat, simpan, selesai.", subtitle: "Lipat, simpan, selesai.", seconds: 7 },
    ]),
  },
];

const LIVE_SCRIPTS = [
  {
    shopId: "shop-1",
    duration: 3600,
    productList: JSON.stringify(["便携式 LED 美妆镜", "天然植物润唇膏"]),
    flow: JSON.stringify([
      { phase: "开场", minutes: 10, goal: "欢迎留人并预告今晚福利", script: "Welcome to our live! Tonight we have two best-sellers with big discounts, stay tuned!" },
      { phase: "商品讲解", minutes: 25, goal: "演示美妆镜三档补光与折叠设计，讲解润唇膏成分", script: "Look at this mirror! Three light modes for any lighting, and it folds flat into your bag…" },
      { phase: "互动", minutes: 10, goal: "答疑互动与抽奖留人", script: "Drop a 1 if you want the mirror, or a 2 for the lip balm! Every 10 minutes we pick a lucky viewer…" },
      { phase: "促销", minutes: 15, goal: "限时折扣逼单", script: "Last 15 minutes! Order now and get $5 off, free shipping included. Don't miss it!" },
    ]),
  },
];

const GENERATIONS = [
  { shopId: "shop-1", type: "copywriting", model: "deepseek-chat", prompt: "为便携式 LED 美妆镜生成英文文案", output: "（演示数据）标题、描述、卖点……", status: "success" },
  { shopId: "shop-2", type: "selection", model: "deepseek-chat", prompt: "分析印尼站收纳用品机会", output: "（演示数据）市场容量、竞争度……", status: "success" },
];

// 内容运营演示数据（商品 DNA / 爆款拆解 / 已发布视频 / 复盘 / 素材需求），只挂在 shop-1 的美妆镜商品上。
const PRODUCT_DNAS = [
  {
    shopId: "shop-1", productId: "prod-1-1",
    targetPersona: "18-34 岁女性，通勤与学生党，追求精致但预算有限",
    useScenarios: "通勤补妆、宿舍化妆台、旅行收纳",
    coreSellingPoints: "三档补光还原自然色；折叠后仅 1cm，随身携带",
    visualHooks: "开灯瞬间脸部亮度对比；粉饼盒大小的折叠特写",
    recommendedFormats: "对比（开灯前后）、教程（通勤快速妆容）、种草",
    competitorDifferences: "同价位多为单档补光，本品三档调光且 USB 充电复用",
  },
];

const CONTENT_REFERENCES = [
  {
    id: "ref-1-1", shopId: "shop-1", productId: "prod-1-1",
    sourceVideoId: "7280000000000000001", sourceUrl: "https://www.tiktok.com/@demo/video/7280000000000000001",
    title: "This $12 mirror replaced my $60 one", angle: "种草",
    playCount: 2400000, conversionRate: 3.2, completionRate: 46,
    hook: "Stop overpaying for this.", sellingPoint: "同功能价格只要五分之一", highFrequencyQuestion: "和贵的那个有什么区别？",
    cta: "Grab yours before it sells out", collectedAt: "2026-08-18T10:00:00Z",
  },
  {
    id: "ref-1-2", shopId: "shop-1", productId: "prod-1-1",
    sourceVideoId: "7280000000000000002", sourceUrl: null,
    title: "Cheap vs expensive: can you tell?", angle: "对比",
    playCount: 860000, conversionRate: null, completionRate: 38,
    hook: "One of these costs 5x more.", sellingPoint: null, highFrequencyQuestion: null,
    cta: "Comment which one you picked", collectedAt: "2026-08-19T10:00:00Z",
  },
];

const PUBLISHED_VIDEOS = [
  {
    id: "pv-1-1", shopId: "shop-1", productId: "prod-1-1", scriptId: "script-1",
    platformVideoId: "7290000000000000001", title: "我回购了 3 次的补光镜，到底好在哪？", angle: "种草",
    durationSeconds: 30, playCount: 186000, orderCount: 412, gmv: 8198.8,
    completionRate: 41, status: "在跑",
    retentionData: JSON.stringify([100, 86, 74, 66, 60, 56, 53, 51]),
    publishedAt: "2026-08-10T12:00:00Z",
  },
];

const VIDEO_REVIEWS = [
  {
    shopId: "shop-1", publishedVideoId: "pv-1-1",
    dropPointSeconds: 3, dropRate: 26,
    summary: "第 3 秒钩子结束进入产品介绍时流失最大，核心卖点出现太晚。",
    suggestions: JSON.stringify(["把三档补光对比提前到第 2 秒", "前 3 秒口播加价格锚点", "第 5 秒前出现字幕大字卖点"]),
    generatedScriptId: null,
  },
];

const SHOT_REQUIREMENTS = [
  {
    id: "sr-1-1", shopId: "shop-1", productId: "prod-1-1", shotCode: "S01",
    scene: "化妆桌前，暗光环境", actionDescription: "特写：手指按下开关，脸部瞬间亮起",
    propsAndLighting: "美妆镜本体、粉底液；环境暗光突出补光效果",
    scriptIds: JSON.stringify(["script-1"]), status: "已完成",
  },
  {
    id: "sr-1-2", shopId: "shop-1", productId: "prod-1-1", shotCode: "S02",
    scene: "通勤包内取物", actionDescription: "中景：从托特包侧袋抽出折叠的镜子",
    propsAndLighting: "托特包、镜子；自然光",
    scriptIds: JSON.stringify(["script-1"]), status: "待拍摄",
  },
];

async function main() {
  if ((await prisma.shop.count()) > 0) {
    console.log("数据库已有数据，跳过 seed（避免覆盖真实数据）。");
    return;
  }
  for (const s of SHOPS) {
    await prisma.shop.create({
      data: {
        id: s.id, name: s.name, market: s.market, description: s.description,
        products: {
          create: s.products.map((p) => ({
            id: p.id, name: p.name, category: p.category, price: p.price, description: p.description,
            variants: { create: p.variants },
            copies: {
              create: p.copies.map((c, i) => ({
                ...c, version: i + 1, source: "ai", isCurrent: i === p.copies.length - 1, shopId: s.id,
              })),
            },
          })),
        },
        conversations: {
          create: s.conversations.map((c) => ({ title: c.title, messages: { create: c.messages } })),
        },
        memories: { create: s.memories },
      },
    });
    console.log(`已创建店铺 ${s.id}：${s.name}（商品 ${s.products.length} 个）`);
  }
  await prisma.videoScript.createMany({ data: VIDEO_SCRIPTS });
  await prisma.liveScript.createMany({ data: LIVE_SCRIPTS });
  await prisma.generation.createMany({ data: GENERATIONS });
  await prisma.productDna.createMany({ data: PRODUCT_DNAS });
  await prisma.contentReference.createMany({ data: CONTENT_REFERENCES });
  await prisma.publishedVideo.createMany({ data: PUBLISHED_VIDEOS });
  await prisma.videoReview.createMany({ data: VIDEO_REVIEWS });
  await prisma.shotRequirement.createMany({ data: SHOT_REQUIREMENTS });
  await prisma.skill.create({
    data: { name: "美式口语化文案", filename: "示例-美式口语化文案.md", description: "生成美区商品文案时使用口语化表达", enabled: true },
  });
  console.log("Seed 完成：2 店铺、6 商品、12 文案、3 对话、9 消息、4 记忆、2 脚本、2 审计、1 技能；内容运营演示数据：1 DNA、2 内容拆解、1 已发布视频、1 复盘、2 素材需求。");
}

main()
  .catch((e) => {
    console.error("Seed 失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
