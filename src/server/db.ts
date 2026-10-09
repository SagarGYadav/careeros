import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One PrismaClient per process: each instance owns a connection pool. In development, Next.js reloads modules on
// every change, so the instance is kept on globalThis to avoid opening a new pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon URLs use sslmode=require. The pg driver currently treats that as verify-full and warns that the next major
// version will weaken it, so we ask for verify-full explicitly: same behaviour today, no surprise downgrade later.
export function withStrictSsl(connectionString: string): string {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (mode && ["prefer", "require", "verify-ca"].includes(mode) && !url.searchParams.has("uselibpqcompat")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: withStrictSsl(connectionString) }) });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
