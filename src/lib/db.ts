import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { openDatabaseAdapter } from "./db-pool";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const adapter = openDatabaseAdapter(PrismaPg);
  return new PrismaClient({ adapter });
}

// One instance, one pool. Stored on globalThis so a second evaluation of this
// module in the same process reuses the client instead of opening another pool.
export const prisma = globalForPrisma.prisma ?? createPrisma();
globalForPrisma.prisma = prisma;
