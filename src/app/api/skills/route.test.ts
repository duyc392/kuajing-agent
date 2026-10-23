// 用途：技能接口测试（直接调用 route handler，临时 SQLite 库 + 临时 skills 目录）：创建、幂等、同名冲突与列表。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTempDb, removeTempDb } from "../../../../prisma/test-utils";

test("技能接口：创建、幂等、同名冲突与校验", async () => {
  const { prisma, url, dbPath } = createTempDb("skills-route-test");
  const cwd = process.cwd();
  const skillsDir = mkdtempSync(path.join(tmpdir(), "kuajing-skills-route-"));
  process.chdir(skillsDir);
  process.env.DATABASE_URL = url;
  try {
    const { GET, POST } = await import("@/app/api/skills/route");
    const post = (body: unknown) => POST(new Request("http://local/api/skills", { method: "POST", body: JSON.stringify(body) }));

    assert.deepEqual(await (await GET()).json(), []);
    assert.equal((await post({ name: "美区SOP" })).status, 400);

    const created = await post({ name: "美区SOP", description: "上架美区商品时", prompt: "第一步查竞品定价", alwaysApply: false });
    assert.equal(created.status, 200);
    const skill = (await created.json()) as { id: string; content: string; alwaysApply: boolean };
    assert.equal(skill.alwaysApply, false);
    assert.match(skill.content, /第一步查竞品定价/);

    const again = await post({ name: "美区SOP", description: "上架美区商品时", prompt: "第一步查竞品定价", alwaysApply: false });
    assert.equal(((await again.json()) as { id: string }).id, skill.id, "同内容重复提交幂等");

    const conflict = await post({ name: "美区SOP", description: "上架美区商品时", prompt: "另一套规则", alwaysApply: false });
    assert.equal(conflict.status, 409);
    assert.equal(((await conflict.json()) as { code: string }).code, "CONFLICT");

    assert.equal(((await (await GET()).json()) as unknown[]).length, 1);
  } finally {
    await prisma.$disconnect();
    const { resetPrismaSingleton } = await import("@/lib/db");
    await resetPrismaSingleton();
    delete process.env.DATABASE_URL;
    process.chdir(cwd);
    rmSync(skillsDir, { recursive: true, force: true });
    await removeTempDb(dbPath);
  }
});
