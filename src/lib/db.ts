// 用途：创建并导出 Prisma 客户端全局单例，供所有服务层访问本地 SQLite 数据库（避免开发热重载时重复建连接）；
// resetPrismaSingleton 仅供测试收尾使用：动态 import 服务层后，单例会握着临时库文件句柄，必须显式断开才能删库。
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// 断开并弃置单例：测试临时库收尾时调用，释放 SQLite 文件句柄；下次任何服务访问会用当前 DATABASE_URL 重建。
export async function resetPrismaSingleton(): Promise<void> {
  const client = globalForPrisma.prisma;
  delete globalForPrisma.prisma;
  if (client) await client.$disconnect();
}
