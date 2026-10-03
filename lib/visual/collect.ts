import "server-only";

import { createHash } from "node:crypto";
import JSZip from "jszip";
import { chartToText, textOf } from "@/lib/xml-text";
import { renderPdfPages } from "./pdf-pages";

// Visual content of an uploaded document (decision 45): what V1 should read
// (PDF pages, images in PPTX/DOCX, uploaded images) and native charts whose
// data is read directly from the file (no model).

export const MAX_VISUALS = 40; // items per document (pages, images and charts)
const MIN_IMAGE_BYTES = 2048; // smaller images are icons or bullets

export const IMAGE_TYPES: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  gif: { mime: "image/gif", ext: "gif" },
  webp: { mime: "image/webp", ext: "webp" },
};

export type VisualItem =
  | { kind: "page" | "image"; locator: string; context: string; image: { bytes: Uint8Array; mimeType: string; ext: string } }
  | { kind: "chart"; locator: string; context: string; chartText: string };

export type CollectResult = { items: VisualItem[]; skipped: string[] };

const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UPLOAD_IMAGES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export const hasVisuals = (mime: string) => mime === "application/pdf" || mime === PPTX || mime === DOCX || mime in UPLOAD_IMAGES;

export async function collectVisuals(mime: string, data: Uint8Array): Promise<CollectResult> {
  if (mime === "application/pdf") {
    const { pages, total } = await renderPdfPages(data, MAX_VISUALS);
    return {
      items: pages.map((p) => ({
        kind: "page" as const,
        locator: `Page ${p.page}`,
        context: p.text,
        image: { bytes: p.png, mimeType: "image/png", ext: "png" },
      })),
      skipped: total > MAX_VISUALS ? [`pages ${MAX_VISUALS + 1}–${total} not read (limit ${MAX_VISUALS})`] : [],
    };
  }
  if (mime in UPLOAD_IMAGES) {
    return { items: [{ kind: "image", locator: "Image", context: "", image: { bytes: data, mimeType: mime, ext: UPLOAD_IMAGES[mime] } }], skipped: [] };
  }
  if (mime === PPTX) return collectPptx(data);
  if (mime === DOCX) return collectDocx(data);
  return { items: [], skipped: [] };
}

// ---------------------------------------------------------------------------
// Office files: images and charts in reading order
// ---------------------------------------------------------------------------

type Rel = { id: string; type: string; target: string };

async function rels(zip: JSZip, path: string, base: string): Promise<Map<string, Rel>> {
  const file = zip.file(path);
  if (!file) return new Map();
  const xml = await file.async("string");
  const out = new Map<string, Rel>();
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const type = /Type="([^"]+)"/.exec(tag)?.[1] ?? "";
    const target = /Target="([^"]+)"/.exec(tag)?.[1];
    if (!id || !target || /TargetMode="External"/.test(tag)) continue;
    out.set(id, { id, type, target: resolve(base, target) });
  }
  return out;
}

function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

// r:embed (pictures) and r:id on c:chart, in document order.
const references = (xml: string) =>
  [...xml.matchAll(/(?:r:embed="([^"]+)")|(?:<c:chart\b[^>]*r:id="([^"]+)")/g)].map((m) => m[1] ?? m[2]);



class Collector {
  readonly items: VisualItem[] = [];
  readonly skipped: string[] = [];
  private readonly seen = new Set<string>();
  constructor(private readonly zip: JSZip) {}

  full() {
    return this.items.length >= MAX_VISUALS;
  }

  async add(rel: Rel | undefined, locatorFor: (kind: "image" | "chart") => string, context: string) {
    if (!rel) return;
    const isChart = /\/chart$/.test(rel.type);
    const isImage = /\/image$/.test(rel.type);
    if (!isChart && !isImage) return;
    const file = this.zip.file(rel.target);
    if (!file) return;
    if (this.full()) {
      this.skipped.push(`${rel.target}: limit of ${MAX_VISUALS} visuals reached`);
      return;
    }
    if (isChart) {
      const text = chartToText(await file.async("string"));
      if (text) this.items.push({ kind: "chart", locator: locatorFor("chart"), context, chartText: text });
      return;
    }
    const ext = rel.target.split(".").pop()?.toLowerCase() ?? "";
    const type = IMAGE_TYPES[ext];
    if (!type) {
      this.skipped.push(`${rel.target}: ${ext.toUpperCase() || "unknown"} images can't be read`);
      return;
    }
    const bytes = await file.async("uint8array");
    if (bytes.byteLength < MIN_IMAGE_BYTES) return;
    const hash = createHash("sha1").update(bytes).digest("hex");
    if (this.seen.has(hash)) return; // repeated logos, backgrounds
    this.seen.add(hash);
    this.items.push({ kind: "image", locator: locatorFor("image"), context, image: { bytes, mimeType: type.mime, ext: type.ext } });
  }
}

async function collectPptx(data: Uint8Array): Promise<CollectResult> {
  const zip = await JSZip.loadAsync(data);
  const c = new Collector(zip);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((s) => Number.isInteger(s.n))
    .sort((a, b) => a.n - b.n);
  for (const { name, n } of slides) {
    const xml = await zip.file(name)!.async("string");
    const slideRels = await rels(zip, `ppt/slides/_rels/slide${n}.xml.rels`, "ppt/slides");
    const context = textOf(xml);
    let img = 0;
    let chart = 0;
    for (const id of references(xml)) {
      await c.add(slideRels.get(id), (k) => (k === "image" ? `Slide ${n} · image ${++img}` : `Slide ${n} · chart ${++chart}`), context);
    }
  }
  return { items: c.items, skipped: c.skipped };
}

async function collectDocx(data: Uint8Array): Promise<CollectResult> {
  const zip = await JSZip.loadAsync(data);
  const c = new Collector(zip);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const docRels = await rels(zip, "word/_rels/document.xml.rels", "word");
  let img = 0;
  let chart = 0;
  for (const id of references(xml)) {
    await c.add(docRels.get(id), (k) => (k === "image" ? `Image ${++img}` : `Chart ${++chart}`), "");
  }
  return { items: c.items, skipped: c.skipped };
}
