// Text and links from a CV file (SPEC §9.1 step 2). PDFs are read with unpdf (pdf.js), DOCX with mammoth.
// Both run locally, cost nothing and never send the file anywhere.
import mammoth from "mammoth";
import { getDocumentProxy } from "unpdf";
import { AppError, isAppError } from "@/lib/errors";
import type { CvFileKind } from "./files";

export type CvLink = { url: string; text: string | null; page: number | null };

export type ExtractedCv = {
  kind: CvFileKind;
  /** All pages, one line per text line; table cells are separated by tabs. */
  text: string;
  pages: string[];
  links: CvLink[];
};

/** Fewer characters than this means a scanned image without a text layer. */
export const MIN_TEXT_CHARS = 200;

type PdfTextItem = { str: string; transform: number[]; width: number; hasEOL: boolean };

// A gap wider than this many font sizes between two pieces of text on one line is a table cell boundary.
const CELL_GAP = 1.2;

/**
 * Rebuilds one page's text in the PDF's own reading order (which keeps two-column layouts in order) and marks
 * wide horizontal gaps with a tab, so table rows keep their cells apart.
 */
function pageText(items: PdfTextItem[]): string {
  let out = "";
  let prevEnd: number | null = null;
  let prevY: number | null = null;
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    const fontSize = Math.hypot(item.transform[2], item.transform[3]) || 10;
    if (prevY !== null && item.str !== "" && Math.abs(y - prevY) > fontSize * 0.6 && !out.endsWith("\n")) {
      out += "\n";
      prevEnd = null;
    }
    const blank = item.str.trim() === "";
    if (blank && item.str.length > 0 && item.width > fontSize * CELL_GAP) {
      if (!/[\t\n]$/.test(out)) out += "\t";
    } else {
      if (!blank && prevEnd !== null && x - prevEnd > fontSize * CELL_GAP && !/[\t\n]$/.test(out)) out += "\t";
      out += item.str;
    }
    if (item.str !== "" || item.width) {
      prevEnd = x + item.width;
      prevY = y;
    }
    if (item.hasEOL) {
      out += "\n";
      prevEnd = null;
    }
  }
  return out;
}

/**
 * The words under a link's box. One text item can hold several links ("LinkedIn | GitHub | Portfolio"), so each
 * word's position is estimated from its share of the item's width.
 */
function anchorText(items: PdfTextItem[], rect: number[]): string {
  const [x1, y1, x2, y2] = rect;
  const words: string[] = [];
  for (const item of items) {
    const y = item.transform[5];
    const x = item.transform[4];
    if (!item.str.trim() || y < y1 - 3 || y > y2 + 3 || x > x2 + 2 || x + item.width < x1 - 2) continue;
    for (const match of item.str.matchAll(/\S+/g)) {
      const center = x + ((match.index + match[0].length / 2) / item.str.length) * item.width;
      if (center >= x1 - 1 && center <= x2 + 1) words.push(match[0]);
    }
  }
  return words
    .join(" ")
    .replace(/^[|·•,]+|[|·•,]+$/g, "")
    .trim();
}

function cleanText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[  ]*\t[\t ]*/g, "\t")
    .split("\n")
    .map((line) => line.replace(/[  ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function extractPdf(bytes: Uint8Array): Promise<Omit<ExtractedCv, "kind">> {
  // pdf.js may take ownership of the buffer it's given, so it gets a copy. Verbosity 0 = errors only.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  const pages: string[] = [];
  const links: CvLink[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is PdfTextItem & typeof item => "str" in item) as PdfTextItem[];
    pages.push(cleanText(pageText(items)));

    // Link annotations: the URL behind linked text such as "LinkedIn", plus the text under the link's box.
    const annotations = (await page.getAnnotations()) as { subtype?: string; url?: string; rect?: number[] }[];
    for (const annotation of annotations) {
      if (annotation.subtype !== "Link" || !annotation.url || !annotation.rect) continue;
      const anchor = anchorText(items, annotation.rect);
      links.push({ url: annotation.url, text: anchor || null, page: pageNumber });
    }
  }
  await pdf.cleanup();
  return { text: pages.join("\n"), pages, links };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function extractDocx(bytes: Uint8Array): Promise<Omit<ExtractedCv, "kind">> {
  const buffer = Buffer.from(bytes);
  const [raw, html] = await Promise.all([mammoth.extractRawText({ buffer }), mammoth.convertToHtml({ buffer })]);
  const links: CvLink[] = [...html.value.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ url: decodeEntities(m[1]), text: decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim() || null }))
    // Internal bookmarks ("#_Toc…") are not links.
    .filter((link) => !link.url.startsWith("#"))
    .map((link) => ({ ...link, page: null }));
  const text = cleanText(raw.value);
  return { text, pages: [text], links };
}

export async function extractCvText(bytes: Uint8Array, kind: CvFileKind): Promise<ExtractedCv> {
  let extracted: Omit<ExtractedCv, "kind">;
  try {
    extracted = kind === "pdf" ? await extractPdf(bytes) : await extractDocx(bytes);
  } catch (error) {
    if (isAppError(error)) throw error;
    throw new AppError("PARSE_FAILED", { cause: error, message: "We couldn't read text from that file." });
  }
  if (extracted.text.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new AppError("PARSE_FAILED", {
      message:
        "This file has almost no selectable text. It may be a scanned image: export it as a text PDF or upload a DOCX.",
    });
  }
  return { kind, ...extracted };
}
