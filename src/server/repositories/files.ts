import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";

// Uploaded files live in Postgres (StoredFile.bytes): CVs are at most 5 MB and few per user, so a separate
// object store would add a service without need (CLAUDE.md rule 9).

const FILE_INFO = { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } as const;

/** Stores a file once per user: uploading the same bytes again returns the existing row. */
export async function saveStoredFile(userId: string, file: { fileName: string; mimeType: string; bytes: Uint8Array }) {
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const existing = await db.storedFile.findFirst({ where: { userId, sha256 }, select: FILE_INFO });
  if (existing) return existing;
  return db.storedFile.create({
    data: {
      userId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.bytes.length,
      sha256,
      bytes: new Uint8Array(file.bytes),
    },
    select: FILE_INFO,
  });
}

/** The file with its bytes, or null when it doesn't exist or belongs to someone else. */
export async function getStoredFile(userId: string, fileId: string) {
  return db.storedFile.findFirst({ where: { id: fileId, userId } });
}
