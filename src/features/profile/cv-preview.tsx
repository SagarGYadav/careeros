"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeForMatch } from "@/lib/cv/text";
import { cn } from "@/lib/utils";

type Box = { text: string; left: number; top: number; width: number; height: number };
type RenderedPage = { image: string; ratio: number; boxes: Box[] };

/**
 * Which pieces of text belong to the quote. Short quotes (a name, an e-mail, a skill) highlight the pieces that
 * contain them; long quotes (a bullet, a role header) highlight the pieces they contain.
 */
function matcher(quote: string | null) {
  const q = quote ? normalizeForMatch(quote) : "";
  if (q.length < 2) return () => false;
  return (text: string) => {
    const t = normalizeForMatch(text);
    if (!t) return false;
    return q.length < 25 ? t.includes(q) : t.length >= 8 && q.includes(t);
  };
}

/** The original PDF drawn with pdf.js (from unpdf), with the selected field's source highlighted. */
function PdfPages({ url, quote }: { url: string; quote: string | null }) {
  const [pages, setPages] = useState<RenderedPage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const firstMatch = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ getDocumentProxy }, response] = await Promise.all([import("unpdf"), fetch(url)]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const pdf = await getDocumentProxy(new Uint8Array(await response.arrayBuffer()), { verbosity: 0 });
        const rendered: RenderedPage[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          const content = await page.getTextContent();
          const boxes: Box[] = [];
          for (const item of content.items) {
            if (!("str" in item) || !item.str.trim()) continue;
            const [x, y] = [item.transform[4], item.transform[5]];
            const [x1, y1] = viewport.convertToViewportPoint(x, y - item.height * 0.25) as number[];
            const [x2, y2] = viewport.convertToViewportPoint(x + item.width, y + item.height) as number[];
            boxes.push({
              text: item.str,
              left: (Math.min(x1, x2) / viewport.width) * 100,
              top: (Math.min(y1, y2) / viewport.height) * 100,
              width: (Math.abs(x2 - x1) / viewport.width) * 100,
              height: (Math.abs(y2 - y1) / viewport.height) * 100,
            });
          }
          rendered.push({ image: canvas.toDataURL("image/png"), ratio: viewport.height / viewport.width, boxes });
        }
        if (!cancelled) setPages(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const isMatch = useMemo(() => matcher(quote), [quote]);

  useEffect(() => {
    firstMatch.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [quote, pages]);

  if (failed) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        The preview couldn&apos;t be drawn. The Text tab shows what was read.
      </p>
    );
  }
  if (!pages) return <Skeleton className="aspect-[1/1.41] w-full" />;

  const highlights = pages.map((page) => page.boxes.filter((box) => isMatch(box.text)));
  const firstPage = highlights.findIndex((boxes) => boxes.length > 0);
  return (
    <div className="space-y-3">
      {pages.map((page, index) => (
        <div
          key={index}
          className="relative w-full overflow-hidden rounded-md border bg-white"
          style={{ aspectRatio: `1 / ${page.ratio}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally rendered data URL, not a remote image */}
          <img src={page.image} alt={`Page ${index + 1} of your CV`} className="absolute inset-0 size-full" />
          {highlights[index].map((box, i) => (
            <div
              key={i}
              ref={index === firstPage && i === 0 ? firstMatch : undefined}
              aria-hidden="true"
              className="absolute rounded-sm bg-brand/25 ring-1 ring-brand/60"
              style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The text CareerOS read from the file, with the selected field's source highlighted. */
function TextView({ text, quote }: { text: string; quote: string | null }) {
  const isMatch = useMemo(() => matcher(quote), [quote]);
  const firstMatch = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    firstMatch.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [quote]);
  const lines = useMemo(() => text.split("\n"), [text]);
  const matches = useMemo(
    () => lines.map((line) => line !== "\f" && Boolean(line.trim()) && isMatch(line)),
    [lines, isMatch],
  );
  const firstIndex = matches.indexOf(true);
  return (
    <div className="space-y-0.5 p-3 text-ui leading-relaxed">
      {lines.map((line, index) => {
        if (line === "\f") return <hr key={index} className="my-3" aria-label="Page break" />;
        if (!line.trim()) return null;
        const match = matches[index];
        return (
          <p
            key={index}
            ref={index === firstIndex ? firstMatch : undefined}
            className={cn("rounded-sm px-1 whitespace-pre-wrap", match && "bg-brand/15 ring-1 ring-brand/40")}
          >
            {line.replace(/\t/g, "    ")}
          </p>
        );
      })}
    </div>
  );
}

export function CvPreview({
  fileUrl,
  isPdf,
  text,
  quote,
  className,
}: {
  fileUrl: string | null;
  isPdf: boolean;
  text: string;
  quote: string | null;
  className?: string;
}) {
  const [tab, setTab] = useState<string>(isPdf && fileUrl ? "original" : "text");
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(String(value))}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <TabsList>
          {isPdf && fileUrl && <TabsTrigger value="original">Original</TabsTrigger>}
          <TabsTrigger value="text">Text read</TabsTrigger>
        </TabsList>
        <p className="truncate text-xs text-muted-foreground">
          {quote ? "Highlighted: where the selected field comes from" : "Select a field to see where it comes from"}
        </p>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl border bg-muted/30 p-2">
        {isPdf && fileUrl && (
          <TabsContent value="original" keepMounted className="data-[hidden]:hidden">
            <PdfPages url={fileUrl} quote={quote} />
          </TabsContent>
        )}
        <TabsContent value="text">
          <TextView text={text} quote={quote} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
