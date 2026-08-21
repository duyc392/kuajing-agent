// 用途：数据导出逻辑：查询当前店铺的全部业务数据（严格按 shopId 隔离，技能为全局表），生成多工作表 .xlsx 文件缓冲，
// 供 /api/export 一键下载备份；SQLite 文件本身也可整体复制作为备份。
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type {
  Conversation,
  Generation,
  LiveScript,
  MemoryEntry,
  Message,
  Product,
  ProductCopy,
  ProductImage,
  ProductVariant,
  Shop,
  Skill,
  VideoScript,
} from "@prisma/client";

// 一个导出表：表名 + 表头列 + 每行单元格值。
interface ExportSheet {
  name: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

// 全量数据：所有店铺的全部业务记录。
interface ExportData {
  shops: Shop[];
  products: Product[];
  variants: ProductVariant[];
  images: ProductImage[];
  copies: ProductCopy[];
  videoScripts: VideoScript[];
  liveScripts: LiveScript[];
  conversations: Conversation[];
  messages: Message[];
  memories: MemoryEntry[];
  generations: Generation[];
  skills: Skill[];
}

// 日期统一转成 ISO 字符串，避免时区偏移；备份跨设备恢复时时间保持精确一致。
function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

// 把单个导出表写入工作簿：首行表头加粗，列宽按表头长度取安全值。
function addSheet(workbook: ExcelJS.Workbook, spec: ExportSheet): void {
  const sheet = workbook.addWorksheet(spec.name);
  sheet.addRow(spec.columns);
  sheet.getRow(1).font = { bold: true };
  for (const row of spec.rows) sheet.addRow(row);
  sheet.columns.forEach((column, index) => {
    const headerLength = (spec.columns[index] ?? "").length;
    column.width = Math.min(Math.max(headerLength * 2 + 4, 12), 40);
  });
}

// 查询当前店铺的所有实体：除全局技能表外全部带 shopId（或经关联）过滤；各表按创建时间升序，保证备份顺序稳定、可重复。
// 全部查询放进同一个 prisma.$transaction，确保 12 张表来自同一数据库快照，避免导出过程中数据变动造成父子记录不一致。
async function fetchAllData(shopId: string): Promise<ExportData> {
  const [shops, products, variants, images, copies, videoScripts, liveScripts, conversations, messages, memories, generations, skills] =
    await prisma.$transaction([
      prisma.shop.findMany({ where: { id: shopId }, orderBy: { createdAt: "asc" } }),
      prisma.product.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
      prisma.productVariant.findMany({ where: { product: { shopId } }, orderBy: { createdAt: "asc" } }),
      prisma.productImage.findMany({ where: { product: { shopId } }, orderBy: [{ productId: "asc" }, { sortOrder: "asc" }] }),
      prisma.productCopy.findMany({ where: { shopId }, orderBy: [{ productId: "asc" }, { version: "asc" }] }),
      prisma.videoScript.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
      prisma.liveScript.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
      prisma.conversation.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
      prisma.message.findMany({ where: { conversation: { shopId } }, orderBy: { createdAt: "asc" } }),
      prisma.memoryEntry.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
      prisma.generation.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } }),
      prisma.skill.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
  return { shops, products, variants, images, copies, videoScripts, liveScripts, conversations, messages, memories, generations, skills };
}

// 核心业务工作表：店铺、商品、变体、图片、文案版本。
function coreDataSheets(data: ExportData): ExportSheet[] {
  return [
    {
      name: "店铺",
      columns: ["ID", "名称", "市场", "简介", "已归档", "创建时间", "更新时间"],
      rows: data.shops.map((s) => [s.id, s.name, s.market, s.description, s.archived, iso(s.createdAt), iso(s.updatedAt)]),
    },
    {
      name: "商品",
      columns: ["ID", "店铺ID", "名称", "类目", "基础价格", "描述", "SKU规则", "创建时间", "更新时间"],
      rows: data.products.map((p) => [p.id, p.shopId, p.name, p.category, p.price, p.description, p.skuRule, iso(p.createdAt), iso(p.updatedAt)]),
    },
    {
      name: "商品变体",
      columns: ["ID", "商品ID", "SKU", "颜色", "尺寸", "价格", "库存", "创建时间"],
      rows: data.variants.map((v) => [v.id, v.productId, v.sku, v.color, v.size, v.price, v.stock, iso(v.createdAt)]),
    },
    {
      name: "商品图片",
      columns: ["ID", "商品ID", "路径", "用途", "提示词", "已应用", "排序", "创建时间"],
      rows: data.images.map((i) => [i.id, i.productId, i.path, i.type, i.prompt, i.applied, i.sortOrder, iso(i.createdAt)]),
    },
    {
      name: "文案版本",
      columns: ["ID", "商品ID", "店铺ID", "标题", "描述", "卖点", "语言", "版本", "来源", "当前版本", "创建时间", "更新时间"],
      rows: data.copies.map((c) => [c.id, c.productId, c.shopId, c.title, c.description, c.sellingPoints, c.language, c.version, c.source, c.isCurrent, iso(c.createdAt), iso(c.updatedAt)]),
    },
  ];
}

// 内容与对话工作表：视频脚本、直播脚本、对话、消息。
function contentSheets(data: ExportData): ExportSheet[] {
  return [
    {
      name: "视频脚本",
      columns: ["ID", "店铺ID", "商品ID", "类型", "时长(秒)", "钩子", "CTA", "风格", "分镜", "创建时间", "更新时间"],
      rows: data.videoScripts.map((v) => [v.id, v.shopId, v.productId, v.type, v.duration, v.hook, v.cta, v.style, v.shots, iso(v.createdAt), iso(v.updatedAt)]),
    },
    {
      name: "直播脚本",
      columns: ["ID", "店铺ID", "时长(秒)", "商品列表", "流程", "创建时间", "更新时间"],
      rows: data.liveScripts.map((l) => [l.id, l.shopId, l.duration, l.productList, l.flow, iso(l.createdAt), iso(l.updatedAt)]),
    },
    {
      name: "对话",
      columns: ["ID", "店铺ID", "标题", "创建时间", "更新时间"],
      rows: data.conversations.map((c) => [c.id, c.shopId, c.title, iso(c.createdAt), iso(c.updatedAt)]),
    },
    {
      name: "消息",
      columns: ["ID", "对话ID", "角色", "内容", "工具调用", "创建时间"],
      rows: data.messages.map((m) => [m.id, m.conversationId, m.role, m.content, m.toolCalls, iso(m.createdAt)]),
    },
  ];
}

// 系统与审计工作表：记忆、生成审计、技能。
function systemSheets(data: ExportData): ExportSheet[] {
  return [
    {
      name: "记忆",
      columns: ["ID", "店铺ID", "分类", "内容", "创建时间", "更新时间"],
      rows: data.memories.map((m) => [m.id, m.shopId, m.category, m.content, iso(m.createdAt), iso(m.updatedAt)]),
    },
    {
      name: "生成审计",
      columns: ["ID", "店铺ID", "类型", "模型", "提示词", "输出", "状态", "错误", "创建时间"],
      rows: data.generations.map((g) => [g.id, g.shopId, g.type, g.model, g.prompt, g.output, g.status, g.error, iso(g.createdAt)]),
    },
    {
      name: "技能",
      columns: ["ID", "名称", "文件名", "描述", "启用", "创建时间", "更新时间"],
      rows: data.skills.map((s) => [s.id, s.name, s.filename, s.description, s.enabled, iso(s.createdAt), iso(s.updatedAt)]),
    },
  ];
}

// 汇总全部工作表：按业务域分组后拼接成一张数据库表对应一张工作表。
function buildSheets(data: ExportData): ExportSheet[] {
  return [...coreDataSheets(data), ...contentSheets(data), ...systemSheets(data)];
}

// 生成 Excel 文件缓冲：校验店铺存在 → 查该店铺数据 → 建工作表 → 序列化为 .xlsx 二进制。
export async function exportExcel(shopId: string): Promise<Buffer> {
  const data = await fetchAllData(shopId);
  if (data.shops.length === 0) throw new NotFoundError("店铺不存在或已归档");
  const sheets = buildSheets(data);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TikTok 跨境电商工作台";
  for (const spec of sheets) addSheet(workbook, spec);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
