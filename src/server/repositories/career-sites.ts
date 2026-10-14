import "server-only";
import { db } from "@/server/db";

export type NewCareerSite = {
  key: string;
  kind: string;
  boardToken: string | null;
  url: string | null;
  name: string;
  source: "discovered" | "user";
  status?: string;
  discoveredFrom?: string | null;
  companyId?: string | null;
};

export async function listCareerSites(userId: string) {
  return db.careerSite.findMany({
    where: { userId },
    orderBy: [{ source: "desc" }, { createdAt: "desc" }],
    include: { company: { select: { name: true } } },
  });
}

export async function findCareerSite(userId: string, key: string) {
  return db.careerSite.findUnique({ where: { userId_key: { userId, key } } });
}

/** Adds sites not in the registry yet; known keys are left as they are. Returns how many were new. */
export async function addDiscoveredSites(userId: string, sites: NewCareerSite[]) {
  if (!sites.length) return 0;
  const { count } = await db.careerSite.createMany({
    data: sites.map((s) => ({ ...s, userId, status: s.status ?? "active" })),
    skipDuplicates: true,
  });
  return count;
}

export async function createCareerSite(userId: string, site: NewCareerSite) {
  return db.careerSite.create({ data: { ...site, userId, status: site.status ?? "active" } });
}

/** A site the user asked for is theirs even if discovery found it first. */
export async function markSiteAsUsers(userId: string, id: string) {
  await db.careerSite.updateMany({ where: { id, userId }, data: { source: "user" } });
}

/** A watchlist name was found: the name entry becomes the real site (or goes, if that site is already known). */
export async function resolveWatchlistName(userId: string, nameId: string, site: Omit<NewCareerSite, "source">) {
  const existing = await findCareerSite(userId, site.key);
  if (existing) {
    await db.$transaction([
      db.careerSite.updateMany({ where: { id: existing.id, userId }, data: { source: "user" } }),
      db.careerSite.deleteMany({ where: { id: nameId, userId } }),
    ]);
    return;
  }
  await db.careerSite.updateMany({
    where: { id: nameId, userId },
    data: { ...site, status: site.status ?? "active", source: "user" },
  });
}

export async function deleteCareerSite(userId: string, id: string) {
  const { count } = await db.careerSite.deleteMany({ where: { id, userId } });
  return count === 1;
}

/** Companies from job-site results, most jobs first, that have no career site yet (not agencies or blocked). */
export async function companiesWithoutSites(userId: string, take: number) {
  if (take <= 0) return [];
  return db.company.findMany({
    where: { userId, careerSites: { none: {} }, isStaffingAgency: false, isBlocked: false },
    orderBy: { jobs: { _count: "desc" } },
    take,
    select: { id: true, name: true, normalizedName: true },
  });
}

/** Companies by normalized name, to link discovered sites to companies already known. */
export async function companiesByKey(userId: string, keys: string[]) {
  if (!keys.length) return new Map<string, string>();
  const rows = await db.company.findMany({
    where: { userId, normalizedName: { in: keys } },
    select: { id: true, normalizedName: true },
  });
  return new Map(rows.map((r) => [r.normalizedName, r.id]));
}
