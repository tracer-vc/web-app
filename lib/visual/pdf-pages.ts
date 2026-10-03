import "server-only";

import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

// @napi-rs/canvas is a native module: imported at runtime, not bundled
// (Turbopack would otherwise link it into .next, which fails on drives
// without junction support). next.config.ts traces it into deployments.
const loadCanvas = () => import(/* turbopackIgnore: true */ /* webpackIgnore: true */ "@napi-rs/canvas");

// PDF pages as PNG with each page's own text layer (decision 45).
export async function renderPdfPages(
  data: Uint8Array,
  maxPages: number,
  scale = 1.5,
): Promise<{ pages: { page: number; png: Uint8Array; text: string }[]; total: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: { page: number; png: Uint8Array; text: string }[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    const img = await renderPageAsImage(new Uint8Array(data), p, { canvasImport: loadCanvas, scale });
    pages.push({ page: p, png: new Uint8Array(img), text: text[p - 1] ?? "" });
  }
  return { pages, total: pdf.numPages };
}
