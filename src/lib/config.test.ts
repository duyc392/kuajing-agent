// 用途：配置读写单测：缺失回默认值、写入后可读、损坏 JSON 报中文错误；测试在临时目录完成，不碰真实 data/。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readKeysConfig, writeKeysConfig } from "@/lib/config";
import { FASTMOSS_DEFAULTS, IMAGE_DEFAULTS, LLM_DEFAULTS } from "@/config/models";
import type { KeysConfig } from "@/types";

const CUSTOM: KeysConfig = {
  llm: { apiKey: "llm-key", baseUrl: "https://llm.example.com", model: "m1", memoryModel: "m2" },
  image: { apiKey: "image-key", baseUrl: "https://image.example.com", model: "gpt-image-2" },
  fastmoss: { apiKey: "fastmoss-key", baseUrl: "https://fastmoss.example.com" },
};

test("配置：缺失回默认、写入后可读、损坏报错", async () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), "kuajing-config-"));
  process.chdir(dir);
  try {
    const defaults = await readKeysConfig();
    assert.equal(defaults.llm.apiKey, "");
    assert.equal(defaults.llm.baseUrl, LLM_DEFAULTS.baseUrl);
    assert.equal(defaults.image.model, IMAGE_DEFAULTS.model);
    assert.equal(defaults.fastmoss.baseUrl, FASTMOSS_DEFAULTS.baseUrl);

    await writeKeysConfig(CUSTOM);
    assert.deepEqual(await readKeysConfig(), CUSTOM);

    mkdirSync(path.join(dir, "data"), { recursive: true });
    writeFileSync(path.join(dir, "data", "config.json"), "{broken");
    await assert.rejects(readKeysConfig(), /已损坏/);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
