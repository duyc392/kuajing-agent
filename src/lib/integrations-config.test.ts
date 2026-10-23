// 用途：集成配置读取单测：配置文件缺失回默认值、文件值生效、环境变量优先于文件。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FEISHU_DEFAULTS, NOTION_DEFAULTS, TTS_DEFAULTS } from "@/config/integrations";
import { readIntegrationsConfig } from "@/lib/integrations-config";

const ENV_KEYS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_BASE_URL",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_MODEL_ID",
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_BITABLE_APP_TOKEN",
  "FEISHU_BITABLE_TABLE_ID",
  "FEISHU_BASE_URL",
  "NOTION_API_KEY",
  "NOTION_DATABASE_ID",
  "NOTION_BASE_URL",
];

test("集成配置：文件缺失回默认值，文件值与环境变量依次覆盖", async () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), "kuajing-integrations-"));
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  process.chdir(dir);
  try {
    const defaults = await readIntegrationsConfig();
    assert.equal(defaults.tts.apiKey, "");
    assert.equal(defaults.tts.baseUrl, TTS_DEFAULTS.baseUrl);
    assert.equal(defaults.feishu.baseUrl, FEISHU_DEFAULTS.baseUrl);
    assert.equal(defaults.notion.baseUrl, NOTION_DEFAULTS.baseUrl);

    mkdirSync(path.join(dir, "data"), { recursive: true });
    writeFileSync(
      path.join(dir, "data", "config.json"),
      JSON.stringify({
        tts: { apiKey: "file-tts", baseUrl: "https://tts.example.com", voiceId: "voice-1", modelId: "model-1" },
        feishu: { appId: "app", appSecret: "secret", appToken: "token", tableId: "table", baseUrl: "https://feishu.example.com" },
        notion: { apiKey: "notion-key", databaseId: "db", baseUrl: "https://notion.example.com" },
      }),
    );
    const fromFile = await readIntegrationsConfig();
    assert.equal(fromFile.tts.apiKey, "file-tts");
    assert.equal(fromFile.tts.baseUrl, "https://tts.example.com");
    assert.equal(fromFile.feishu.appId, "app");
    assert.equal(fromFile.notion.databaseId, "db");

    process.env.ELEVENLABS_API_KEY = "env-tts";
    process.env.FEISHU_APP_ID = "env-app";
    process.env.NOTION_API_KEY = "env-notion";
    const fromEnv = await readIntegrationsConfig();
    assert.equal(fromEnv.tts.apiKey, "env-tts");
    assert.equal(fromEnv.feishu.appId, "env-app");
    assert.equal(fromEnv.notion.apiKey, "env-notion");
  } finally {
    process.chdir(cwd);
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
