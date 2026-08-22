import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client.
 *
 * Cached on globalThis so Next's dev-mode hot reload does not open a new
 * connection pool on every edit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
