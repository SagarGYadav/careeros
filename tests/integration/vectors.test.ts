// pgvector storage and similarity queries (mock vectors; the real models are checked in the live run).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_EMBEDDING_MODEL, mockEmbedding } from "@/lib/embeddings/providers";
import { db } from "@/server/db";
import {
  getProfileEmbeddingInfo,
  jobSimilarities,
  jobsNeedingEmbedding,
  nearestJobs,
  setJobEmbeddings,
  setProfileEmbedding,
} from "@/server/repositories/vectors";

const EMAIL_DOMAIN = "@vectors.integration.careeros.test";
let userId: string;
const jobIds: Record<string, string> = {};

const JOBS = {
  react: "Senior React developer building Next.js dashboards in TypeScript",
  frontend: "Frontend engineer, React and TypeScript, design systems",
  accounts: "Accountant for GST filings, payroll and audits",
};

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Vectors Test", email: `v-${userId}${EMAIL_DOMAIN}` } });
  for (const [key, text] of Object.entries(JOBS)) {
    const job = await db.job.create({
      data: {
        userId,
        companyName: "Fictional Co",
        title: key,
        descriptionRaw: text,
        descriptionHash: key,
        origin: "search",
        provider: "mock",
        externalId: key,
        applyLinks: [],
      },
    });
    jobIds[key] = job.id;
  }
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("vector repository", () => {
  it("stores profile and job vectors and ranks jobs by cosine similarity", async () => {
    await setProfileEmbedding(
      userId,
      MOCK_EMBEDDING_MODEL,
      mockEmbedding("React and TypeScript developer, Next.js"),
      "hash-1",
    );
    expect(await getProfileEmbeddingInfo(userId)).toEqual({
      model: MOCK_EMBEDDING_MODEL,
      sourceHash: "hash-1",
      hasVector: true,
    });

    expect(await jobsNeedingEmbedding(userId, MOCK_EMBEDDING_MODEL)).toHaveLength(3);
    const updated = await setJobEmbeddings(
      userId,
      MOCK_EMBEDDING_MODEL,
      Object.entries(JOBS).map(([key, text]) => ({ jobId: jobIds[key], vector: mockEmbedding(text) })),
    );
    expect(updated).toBe(3);
    expect(await jobsNeedingEmbedding(userId, MOCK_EMBEDDING_MODEL)).toEqual([]);

    const similarity = await jobSimilarities(userId, Object.values(jobIds));
    expect(similarity.get(jobIds.react)!).toBeGreaterThan(similarity.get(jobIds.accounts)!);
    const nearest = await nearestJobs(userId, 3);
    expect(nearest[0].id).not.toBe(jobIds.accounts);
    expect(nearest.at(-1)!.id).toBe(jobIds.accounts);
  });

  it("never compares vectors from different models", async () => {
    await setJobEmbeddings(userId, "bge-small-en-v1.5", [{ jobId: jobIds.react, vector: mockEmbedding(JOBS.react) }]);
    const similarity = await jobSimilarities(userId, Object.values(jobIds));
    expect(similarity.has(jobIds.react)).toBe(false);
    expect((await jobsNeedingEmbedding(userId, MOCK_EMBEDDING_MODEL)).map((j) => j.id)).toEqual([jobIds.react]);
  });
});
