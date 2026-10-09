// CV upload end to end against the test database, with the mock AI provider.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cvDraftSchema } from "@/lib/cv/schema";
import { db } from "@/server/db";
import { getResumeVersion, listResumeVersions } from "@/server/repositories/resumes";
import { processCvUpload } from "@/server/services/cv-pipeline";

const EMAIL_DOMAIN = "@cv.integration.careeros.test";
const NOW = new Date("2026-10-09T10:00:00Z");
let userId: string;
let otherUserId: string;

async function createUser(name: string) {
  const id = randomUUID();
  await db.user.create({ data: { id, name, email: `${name.toLowerCase()}-${id}${EMAIL_DOMAIN}` } });
  return id;
}

beforeAll(async () => {
  userId = await createUser("Uploader");
  otherUserId = await createUser("Other");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

const read = (file: string) => new Uint8Array(readFileSync(`fixtures/cv/${file}`));

describe("CV upload pipeline", () => {
  it("stores the file, parses it with the mock AI and saves a verified draft for review", async () => {
    const stages: string[] = [];
    const result = await processCvUpload(
      userId,
      { fileName: "C:\\fakepath\\arjun-linked-text.pdf", bytes: read("arjun-linked-text.pdf") },
      { now: NOW, onStage: (stage) => stages.push(stage) },
    );
    expect(stages).toEqual(["stored", "parsing", "verifying", "saved"]);

    const row = await getResumeVersion(userId, result.resumeId);
    expect(row).toMatchObject({
      name: "arjun-linked-text",
      parseStatus: "parsed",
      parseMode: "ai",
      parseProvider: "mock",
      pageCount: 1,
      injectionSuspected: false,
    });
    const draft = cvDraftSchema.parse(row!.parsed);
    expect(draft.personal.linkedin).toBe("https://www.linkedin.com/in/arjun-desai-example");
    expect(Array.isArray(row!.evidence)).toBe(true);
    expect(row!.extractedText).toContain("Banyan Analytics");

    const file = await db.storedFile.findUnique({ where: { id: row!.fileId! } });
    expect(file).toMatchObject({ fileName: "arjun-linked-text.pdf", mimeType: "application/pdf" });
  });

  it("stores the same file once, and keeps each user's CVs private", async () => {
    const first = await processCvUpload(
      userId,
      { fileName: "sneha.docx", bytes: read("sneha-docx.docx") },
      { now: NOW },
    );
    const second = await processCvUpload(
      userId,
      { fileName: "sneha.docx", bytes: read("sneha-docx.docx") },
      { now: NOW },
    );
    const [a, b] = await Promise.all([
      getResumeVersion(userId, first.resumeId),
      getResumeVersion(userId, second.resumeId),
    ]);
    expect(a!.fileId).toBe(b!.fileId);
    expect(a!.pageCount).toBeNull();

    expect(await getResumeVersion(otherUserId, first.resumeId)).toBeNull();
    expect(await listResumeVersions(otherUserId)).toEqual([]);
    expect((await listResumeVersions(userId)).length).toBe(3);
  });

  it("marks the version failed when the file has no text, and rejects unsupported files before storing", async () => {
    const emptyPdf = new TextEncoder().encode(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    );
    await expect(processCvUpload(otherUserId, { fileName: "scan.pdf", bytes: emptyPdf })).rejects.toMatchObject({
      code: "PARSE_FAILED",
    });
    const [failed] = await listResumeVersions(otherUserId);
    expect(failed.parseStatus).toBe("failed");

    await expect(
      processCvUpload(otherUserId, { fileName: "cv.pdf", bytes: new TextEncoder().encode("not a pdf") }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
    expect(await db.storedFile.count({ where: { userId: otherUserId } })).toBe(1);
  });
});
