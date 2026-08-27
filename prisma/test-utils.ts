// 用途：内容运营测试共用的临时 SQLite 库工具：随机库名建库并 push schema、句柄释放后清理；
// 库文件相对路径以 prisma/ 目录为基准解析（Prisma 约定），避开 Windows 绝对路径触发 Schema engine error，
// 文件名带随机串防并发互踩；库文件落在 prisma/ 下且被 .gitignore 兜底忽略。
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const PRISMA_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(PRISMA_DIR, "..");

export interface TempDb {
  prisma: PrismaClient;
  url: string;
  dbPath: string;
}

// 建临时库并返回绑定该库的独立客户端：不改动进程环境变量与共享单例（服务层自管理环境变量时再自行 set）。
// 显式走 pwsh（Windows 下 execSync 默认 cmd.exe 兼容性差），首行 $ErrorActionPreference 保证失败即抛；
// 初始化失败时清理半成品库文件，不留无法使用的残留。
export function createTempDb(prefix: string): TempDb {
  const dbName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  const url = `file:${dbName}`;
  const dbPath = path.join(PRISMA_DIR, dbName);
  const script = "$ErrorActionPreference = 'Stop'; npx prisma db push --skip-generate --accept-data-loss";
  const result = spawnSync("pwsh", ["-NoProfile", "-Command", script], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.status !== 0) {
    removeSyncFiles(dbPath);
    throw new Error(`临时库初始化失败：${result.stderr || result.stdout || `退出码 ${result.status}`}`);
  }
  return { prisma: new PrismaClient({ datasources: { db: { url } } }), url, dbPath };
}

function removeSyncFiles(dbPath: string): void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      rmSync(`${dbPath}${suffix}`, { force: true });
    } catch {
      // 尽力清理，删除失败不掩盖原始错误。
    }
  }
}

// 删除临时库文件：Windows 下查询引擎句柄释放有延迟，重试数轮；全部失败时明确抛错（不静默留残留文件）。
export async function removeTempDb(dbPath: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      removeSyncFiles(dbPath);
      return;
    } catch {
      // 句柄尚未释放，稍后重试。
    }
  }
  throw new Error(`临时库文件删除失败（句柄未释放）：${dbPath}`);
}
