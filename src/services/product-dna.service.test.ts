// 用途：商品 DNA 服务层测试（临时 SQLite 库）：保存后存在、再次保存覆盖且查询显式带 shopId、跨店铺访问 404、商品删除后 DNA 级联清理。
import test from "node:test";
import assert from "node:assert/strict";
import { createTempDb, removeTempDb } from "../../prisma/test-utils";

const INPUT = {
  targetPersona: "18-34 岁女性",
  useScenarios: "通勤补妆",
  coreSellingPoints: "三档补光",
  visualHooks: "开灯对比",
  recommendedFormats: "对比 + 教程",
  competitorDifferences: "三档调光",
};

test("商品 DNA：保存后可读、再次保存覆盖且只有一条记录、跨店铺与缺商品拒绝、商品删除后级联清理", async () => {
  // 临时库（随机名、不触碰开发库）；被测服务经 @/lib/db 读环境变量建客户端：先指库再导入，保证服务操作落在临时库上。
  const { prisma, url, dbPath } = createTempDb("dna-test");
  process.env.DATABASE_URL = url;
  try {
    await prisma.shop.create({ data: { id: "s-a", name: "店铺 A", market: "美国" } });
    await prisma.shop.create({ data: { id: "s-b", name: "店铺 B", market: "印尼" } });
    await prisma.product.create({ data: { id: "p-a", shopId: "s-a", name: "美妆镜" } });

    const { getProductDna, upsertProductDna } = await import("@/services/product-dna.service");

    // 未保存时返回 null（正常态，非错误）。
    assert.equal(await getProductDna({ id: "p-a", shopId: "s-a" }), null);

    // 保存后可读。
    const first = await upsertProductDna({ id: "p-a", shopId: "s-a" }, INPUT);
    assert.equal(first.shopId, "s-a");
    assert.equal(first.productId, "p-a");
    const read = await getProductDna({ id: "p-a", shopId: "s-a" });
    assert.ok(read);
    assert.equal(read.coreSellingPoints, "三档补光");

    // 再次保存覆盖旧内容，不产生第二条记录。
    const second = await upsertProductDna({ id: "p-a", shopId: "s-a" }, { ...INPUT, coreSellingPoints: "四档补光" });
    assert.equal(second.id, first.id, "覆盖时应复用同一条记录");
    assert.equal(await prisma.productDna.count({ where: { productId: "p-a" } }), 1);
    const readAgain = await getProductDna({ id: "p-a", shopId: "s-a" });
    assert.equal(readAgain?.coreSellingPoints, "四档补光");

    // 跨店铺或商品不存在：拒绝对外返回数据。
    await assert.rejects(getProductDna({ id: "p-a", shopId: "s-b" }));
    await assert.rejects(getProductDna({ id: "p-none", shopId: "s-a" }));

    // 商品删除后 DNA 级联清理。
    await prisma.product.delete({ where: { id: "p-a" } });
    assert.equal(await prisma.productDna.count({ where: { shopId: "s-a" } }), 0);
  } finally {
    await prisma.$disconnect();
    // 动态 import 的服务层经 @/lib/db 持有单例连接，必须一并断开，否则 SQLite 文件句柄不释放、临时库删不掉。
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    await removeTempDb(dbPath);
  }
});
