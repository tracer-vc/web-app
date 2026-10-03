import "server-only";

import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText as extractPdfText } from "unpdf";
import { decodeEntities } from "./xml-text";

// Supported upload types (bucket deal-documents allows the same list).
export const DOCUMENT_TYPES: Record<string, { label: string; ext: string }> = {
  "application/pdf": { label: "PDF", ext: "pdf" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { label: "PPTX", ext: "pptx" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "DOCX", ext: "docx" },
  "text/html": { label: "HTML", ext: "html" },
  "text/plain": { label: "TXT", ext: "txt" },
  "text/markdown": { label: "Markdown", ext: "md" },
  // Images carry no text layer; their content is read by V1 (decision 45).
  "image/png": { label: "PNG", ext: "png" },
  "image/jpeg": { label: "JPEG", ext: "jpg" },
  "image/webp": { label: "WebP", ext: "webp" },
};

// Less than this many non-whitespace characters counts as "no text extracted"
// (decision 7: no OCR; e.g. image-only decks).
const MIN_TEXT_CHARS = 40;

export type ExtractionResult =
  | { status: "extracted"; text: string }
  | { status: "no_text"; text: string }
  | { status: "failed"; error: string };

export async function extractDocumentText(mime: string, data: Uint8Array): Promise<ExtractionResult> {
  try {
    const text = normalise(await extractByType(mime, data));
    return text.replace(/\s/g, "").length < MIN_TEXT_CHARS ? { status: "no_text", text } : { status: "extracted", text };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function extractByType(mime: string, data: Uint8Array): Promise<string> {
  switch (mime) {
    case "application/pdf": {
      const { text } = await extractPdfText(data, { mergePages: false });
      return text.map((page, i) => `[Page ${i + 1}]\n${page}`).join("\n\n");
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      return value;
    }
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractPptx(data);
    case "text/html":
      return htmlToText(new TextDecoder().decode(data));
    case "image/png":
    case "image/jpeg":
    case "image/webp":
      return "";
    case "text/plain":
    case "text/markdown":
      return new TextDecoder().decode(data);
    default:
      throw new Error(`unsupported file type ${mime}`);
  }
}

// Slide text from ppt/slides/slideN.xml (<a:t> runs, <a:p> paragraphs).
async function extractPptx(data: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((s) => Number.isInteger(s.n))
    .sort((a, b) => a.n - b.n);

  const parts: string[] = [];
  for (const { name, n } of slides) {
    const xml = await zip.file(name)!.async("string");
    const paragraphs = xml
      .split(/<\/a:p>/)
      .map((p) => [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeEntities(m[1])).join(""))
      .filter((p) => p.trim());
    parts.push(`[Slide ${n}]\n${paragraphs.join("\n")}`);
  }
  return parts.join("\n\n");
}

// Readable text from HTML: drop scripts/styles/navigation, keep block breaks.
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(head|script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}



function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
