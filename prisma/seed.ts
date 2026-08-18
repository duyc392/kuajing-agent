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
          { role: "agent", content: "正在调用选品工具分析美区数据……（演示数据）", toolCalls: JSON.stringify([{ tool: "analyzeMarket", status: "running" }]) },
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
          { role: "agent", content: "折叠收纳箱搜索量上升，竞争度中等。（演示数据）", toolCalls: JSON.stringify([{ tool: "analyzeMarket", status: "done" }]) },
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
    shopId: "shop-1", type: "种草", duration: 30, style: "美式快节奏种草",
    hook: "我回购了 3 次的补光镜，到底好在哪？", cta: "点击购物车，现在下单立减 5 美元",
    shots: JSON.stringify([
      { shot: 1, scene: "特写开箱", voiceover: "This mirror changed my makeup game.", duration: 5 },
      { shot: 2, scene: "三档补光演示", voiceover: "Three light modes for any lighting.", duration: 8 },
      { shot: 3, scene: "折叠收纳", voiceover: "Folds flat for your bag.", duration: 7 },
      { shot: 4, scene: "行动号召", voiceover: "Grab yours now with $5 off.", duration: 10 },
    ]),
  },
  {
    shopId: "shop-2", type: "开箱", duration: 15, style: "印尼语快节奏开箱",
    hook: "Kotak ini bisa dilipat?", cta: "Cek keranjang kuning sekarang",
    shots: JSON.stringify([
      { shot: 1, scene: "开箱", voiceover: "Buka kotak, lihat isinya.", duration: 5 },
      { shot: 2, scene: "承重演示", voiceover: "Kuat sampai 15 kilo.", duration: 5 },
      { shot: 3, scene: "折叠对比", voiceover: "Lipat, simpan, selesai.", duration: 5 },
    ]),
  },
];

const LIVE_SCRIPTS = [
  { shopId: "shop-1", duration: 3600, productList: "便携式 LED 美妆镜、天然植物润唇膏", flow: "开场福利 → 产品讲解 → 互动抽奖 → 促销收尾" },
];

const GENERATIONS = [
  { shopId: "shop-1", type: "copywriting", model: "deepseek-chat", prompt: "为便携式 LED 美妆镜生成英文文案", output: "（演示数据）标题、描述、卖点……", status: "success" },
  { shopId: "shop-2", type: "selection", model: "deepseek-chat", prompt: "分析印尼站收纳用品机会", output: "（演示数据）市场容量、竞争度……", status: "success" },
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
                ...c, version: i + 1, source: "ai", isCurrent: i === p.copies.length - 1,
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
  await prisma.skill.create({
    data: { name: "美式口语化文案", filename: "示例-美式口语化文案.md", description: "生成美区商品文案时使用口语化表达", enabled: true },
  });
  console.log("Seed 完成：2 店铺、6 商品、12 文案、3 对话、9 消息、4 记忆、3 脚本、2 审计、1 技能。");
}

main()
  .catch((e) => {
    console.error("Seed 失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
