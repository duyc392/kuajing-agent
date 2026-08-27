// 用途：内容运营数据结构守护测试：
// 静态部分——schema 里 Product 字段集合不变（只允许新增反向关联）、五张新表都带 shopId、级联与置空声明齐全；
// 数据库部分——用临时 SQLite 库真实验证「删商品级联清空全部关联内容」。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDb, removeTempDb } from "./test-utils";

const PROJECT_ROOT = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SCHEMA_PATH = path.join(PROJECT_ROOT, "prisma", "schema.prisma");

function readModelBlock(name: string): string {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `schema 中缺少 model ${name}`);
  return match[1];
}

// 提取两空格缩进的字段名（@@ 属性行以 @ 开头，不会命中）。
function fieldNames(block: string): string[] {
  return [...block.matchAll(/^ {2}([A-Za-z]+)\s/gm)].map((match) => match[1]);
}

test("Product 字段集合不变：只允许既有字段与新增反向关联", () => {
  const expected = [
    "id", "shopId", "shop", "name", "category", "price", "description", "skuRule", "createdAt", "updatedAt",
    "copies", "variants", "images", "videoScripts",
    "dna", "contentReferences", "publishedVideos", "shotRequirements",
  ].sort();
  assert.deepEqual(fieldNames(readModelBlock("Product")).sort(), expected);
});

test("五张新表都声明 shopId 隔离键且商品删除级联", () => {
  const models = ["ProductDna", "ContentReference", "PublishedVideo", "VideoReview", "ShotRequirement"];
  for (const model of models) {
    const block = readModelBlock(model);
    assert.match(block, /^ {2}shopId\s+String/m, `${model} 缺少 shopId`);
    assert.match(block, /onDelete: Cascade/, `${model} 缺少级联删除声明`);
  }
});

test("一对一约束：DNA 挂商品、复盘挂视频，均为唯一键", () => {
  assert.match(readModelBlock("ProductDna"), /^ {2}productId\s+String\s+@unique/m);
  assert.match(readModelBlock("VideoReview"), /^ {2}publishedVideoId\s+String\s+@unique/m);
});

test("VideoScript 增加 version 与 parentScriptId 自关联", () => {
  const block = readModelBlock("VideoScript");
  assert.match(block, /version\s+Int\s+@default\(1\)/);
  assert.match(block, /parentScriptId\s+String\?/);
});

test("数据库行为：删商品级联清空关联脚本与内容运营数据", async () => {
  const { prisma, dbPath } = createTempDb("cascade-test");
  try {
    await prisma.shop.create({ data: { id: "t-shop", name: "测试店铺", market: "美国" } });
    await prisma.product.create({ data: { id: "t-prod", shopId: "t-shop", name: "测试商品" } });
    await prisma.videoScript.create({
      data: { id: "t-script", shopId: "t-shop", productId: "t-prod", type: "种草", duration: 15, hook: "钩子", cta: "下单", shots: "[]" },
    });
    await prisma.productDna.create({
      data: { shopId: "t-shop", productId: "t-prod", targetPersona: "画像", useScenarios: "场景", coreSellingPoints: "卖点", visualHooks: "视觉", recommendedFormats: "种草", competitorDifferences: "差异" },
    });
    await prisma.contentReference.create({
      data: { shopId: "t-shop", productId: "t-prod", title: "标题", angle: "种草", playCount: 100, hook: "钩子", cta: "行动", collectedAt: new Date() },
    });
    await prisma.publishedVideo.create({
      data: { id: "t-video", shopId: "t-shop", productId: "t-prod", scriptId: "t-script", title: "标题", angle: "种草", durationSeconds: 30, playCount: 100, orderCount: 10, gmv: 99.9, status: "在跑", retentionData: "[100,80]" },
    });
    await prisma.videoReview.create({
      data: { shopId: "t-shop", publishedVideoId: "t-video", summary: "总结", suggestions: "[]", generatedScriptId: "t-script" },
    });
    await prisma.shotRequirement.create({
      data: { shopId: "t-shop", productId: "t-prod", shotCode: "S01", scene: "场景", actionDescription: "动作", propsAndLighting: "道具", scriptIds: "[]", status: "待拍摄" },
    });

    // 新表记录都能按 shopId 查到（隔离键可用）。
    assert.equal((await prisma.productDna.findMany({ where: { shopId: "t-shop" } })).length, 1);
    assert.equal((await prisma.publishedVideo.findMany({ where: { shopId: "t-shop" } })).length, 1);

    // 删除商品：关联脚本与内容运营数据全部级联删除。
    await prisma.product.delete({ where: { id: "t-prod" } });
    assert.equal(await prisma.videoScript.count({ where: { shopId: "t-shop" } }), 0);
    assert.equal(await prisma.productDna.count({ where: { shopId: "t-shop" } }), 0);
    assert.equal(await prisma.contentReference.count({ where: { shopId: "t-shop" } }), 0);
    assert.equal(await prisma.publishedVideo.count({ where: { shopId: "t-shop" } }), 0);
    assert.equal(await prisma.videoReview.count({ where: { shopId: "t-shop" } }), 0);
    assert.equal(await prisma.shotRequirement.count({ where: { shopId: "t-shop" } }), 0);
  } finally {
    await prisma.$disconnect();
    await removeTempDb(dbPath);
  }
});
