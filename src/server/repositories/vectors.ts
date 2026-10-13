import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

// All pgvector SQL lives here (SPEC §4): Prisma can't read or write vector columns, so these use raw queries.
// Vectors are only ever compared with vectors made by the same model (`embeddingModel`).

const literal = (vector: number[]) => `[${vector.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;

/** Saves job vectors in one statement. */
export async function setJobEmbeddings(userId: string, model: string, rows: { jobId: string; vector: number[] }[]) {
  if (!rows.length) return 0;
  const values = rows.map((r) => Prisma.sql`(${r.jobId}, ${literal(r.vector)})`);
  return db.$executeRaw`
    UPDATE jobs AS j
    SET embedding = v.vec::vector, "embeddingModel" = ${model}, "embeddedAt" = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, vec)
    WHERE j.id = v.id AND j."userId" = ${userId}`;
}

export async function setProfileEmbedding(userId: string, model: string, vector: number[], sourceHash: string) {
  await db.$executeRaw`
    INSERT INTO career_profiles ("userId", embedding, "embeddingModel", "embeddingSourceHash", currency, "preferredLocations", "workModes", domains, "openToRelocate", "createdAt", "updatedAt")
    VALUES (${userId}, ${literal(vector)}::vector, ${model}, ${sourceHash}, 'INR', '{}', '{}', '{}', false, now(), now())
    ON CONFLICT ("userId") DO UPDATE
    SET embedding = EXCLUDED.embedding, "embeddingModel" = EXCLUDED."embeddingModel",
        "embeddingSourceHash" = EXCLUDED."embeddingSourceHash", "updatedAt" = now()`;
}

/** Which model made the profile vector and from what text (to know when to re-embed), without the vector. */
export async function getProfileEmbeddingInfo(userId: string) {
  const rows = await db.$queryRaw<{ model: string | null; sourceHash: string | null; hasVector: boolean }[]>`
    SELECT "embeddingModel" AS model, "embeddingSourceHash" AS "sourceHash", embedding IS NOT NULL AS "hasVector"
    FROM career_profiles WHERE "userId" = ${userId}`;
  return rows[0] ?? null;
}

/** Cosine similarity (−1…1) between the profile vector and each job's vector, for jobs embedded by the same model. */
export async function jobSimilarities(userId: string, jobIds: string[]): Promise<Map<string, number>> {
  if (!jobIds.length) return new Map();
  const rows = await db.$queryRaw<{ id: string; similarity: number }[]>`
    SELECT j.id, 1 - (j.embedding <=> p.embedding) AS similarity
    FROM jobs j JOIN career_profiles p ON p."userId" = j."userId"
    WHERE j."userId" = ${userId} AND j.id = ANY(${jobIds})
      AND j.embedding IS NOT NULL AND p.embedding IS NOT NULL AND j."embeddingModel" = p."embeddingModel"`;
  return new Map(rows.map((r) => [r.id, Number(r.similarity)]));
}

/** Jobs still without a vector from `model` (embedding deferred or made by another model). */
export async function jobsNeedingEmbedding(userId: string, model: string, limit = 200) {
  return db.$queryRaw<{ id: string; title: string; descriptionRaw: string }[]>`
    SELECT id, title, "descriptionRaw" FROM jobs
    WHERE "userId" = ${userId} AND (embedding IS NULL OR "embeddingModel" IS DISTINCT FROM ${model})
    ORDER BY "discoveredAt" DESC LIMIT ${limit}`;
}

/** Jobs closest to the profile (uses the HNSW index). */
export async function nearestJobs(userId: string, limit = 50) {
  return db.$queryRaw<{ id: string; similarity: number }[]>`
    SELECT j.id, 1 - (j.embedding <=> p.embedding) AS similarity
    FROM jobs j JOIN career_profiles p ON p."userId" = j."userId"
    WHERE j."userId" = ${userId} AND j.embedding IS NOT NULL AND j."embeddingModel" = p."embeddingModel"
    ORDER BY j.embedding <=> p.embedding
    LIMIT ${limit}`;
}
