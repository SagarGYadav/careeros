// Upload checks (SPEC §9.1 step 1): the file type comes from its first bytes, never from the name or the
// browser's MIME type, so a renamed file can't slip through.
import { AppError } from "@/lib/errors";

export const MAX_CV_BYTES = 5 * 1024 * 1024;

export type CvFileKind = "pdf" | "docx";

export const CV_MIME_TYPES: Record<CvFileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = [...text].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** "pdf" for %PDF-, "docx" for a ZIP containing word/document.xml, otherwise null. */
export function detectCvFileKind(bytes: Uint8Array): CvFileKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  // ZIP entry names are stored as plain text in the local file headers.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(bytes, "word/document.xml")) return "docx";
  return null;
}

export function validateCvFile(file: { fileName: string; bytes: Uint8Array }): { kind: CvFileKind; mimeType: string } {
  if (file.bytes.length === 0) throw new AppError("PARSE_FAILED", { message: "The file is empty." });
  if (file.bytes.length > MAX_CV_BYTES) throw new AppError("FILE_TOO_LARGE");
  const kind = detectCvFileKind(file.bytes);
  if (!kind) {
    const legacyDoc = startsWith(file.bytes, [0xd0, 0xcf, 0x11, 0xe0]);
    throw new AppError("UNSUPPORTED_FILE", {
      message: legacyDoc
        ? "Old Word (.doc) files aren't supported. Save it as .docx or PDF."
        : "That file type isn't supported. Upload a PDF or DOCX.",
    });
  }
  return { kind, mimeType: CV_MIME_TYPES[kind] };
}
