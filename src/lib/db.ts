// 用途：创建并导出 Prisma 客户端全局单例，供所有服务层访问本地 SQLite 数据库（避免开发热重载时重复建连接）。
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
