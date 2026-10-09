import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";

const EMAIL_DOMAIN = "@db.integration.careeros.test";

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("test database", () => {
  it("has pgvector enabled by the migrations", async () => {
    const rows = await db.$queryRaw<
      { extversion: string }[]
    >`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    expect(rows).toHaveLength(1);
  });

  it("deletes a user's sessions and accounts with the user", async () => {
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        name: "Cascade Check",
        email: `cascade-${userId}${EMAIL_DOMAIN}`,
        sessions: { create: { id: randomUUID(), token: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } },
        accounts: { create: { id: randomUUID(), accountId: userId, providerId: "credential" } },
      },
    });

    await db.user.delete({ where: { id: userId } });

    expect(await db.session.count({ where: { userId } })).toBe(0);
    expect(await db.account.count({ where: { userId } })).toBe(0);
  });
});
