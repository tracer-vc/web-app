import * as z from "zod";
import type { PromptDef } from "../types";

// V1 Read visual (decision 45): one image from an uploaded document (a PDF
// page, an image in a deck or Word file, or an uploaded image). The model
// transcribes what the image conveys beyond the text already extracted from
// the same page or slide, faithfully and without interpretation, or reports
// it as not informative. The transcription becomes citable source text.

export type V1Input = {
  document: string; // filename
  locator: string; // "Page 3", "Slide 5 · image 2", "Image"
  pageText: string; // text already extracted from the same page/slide ("" if none)
  image: { mimeType: string; base64: string };
};

export const MAX_TRANSCRIPTION = 3000;

const schema = z.object({
  informative: z.boolean().describe("false if the image is decorative or adds nothing beyond the page text."),
  transcription: z.string().describe("What the image shows, as plain sentences; empty if not informative."),
});

export type V1Output = z.infer<typeof schema>;

export const V1: PromptDef<V1Input, typeof schema> = {
  key: "V1",
  version: "1",
  name: "read_visual",
  system: [
    "You read one image from a document a venture fund received about a company. Transcribe the information the image conveys that is not already in the page text given: numbers in charts (with labels, units, periods and series), table contents, diagram labels and relations, text in screenshots or scans, and names of customers or partners shown as logos if they are legible.",
    "Be faithful: only what is visible, in plain sentences, with figures exactly as shown. Do not interpret, judge, estimate values between gridlines or add outside knowledge. Mark unreadable parts as [illegible].",
    "If the image is decorative (photos without information, icons, backgrounds, logos of the company itself) or only repeats the page text, set informative to false and leave the transcription empty.",
    `Keep the transcription under ${MAX_TRANSCRIPTION} characters. Write in English; quote non-English text as it appears.`,
  ].join("\n"),
  user: (i) =>
    [
      `Document: ${i.document} · ${i.locator}`,
      "",
      "Text already extracted from this page/slide:",
      i.pageText.trim() ? i.pageText.slice(0, 4000) : "(none — this may be a scanned page or a standalone image)",
    ].join("\n"),
  images: (i) => [{ label: `${i.document} · ${i.locator}`, mimeType: i.image.mimeType, base64: i.image.base64 }],
  schema,
  validate: (o) => {
    const errors: string[] = [];
    if (o.informative && !o.transcription.trim()) errors.push("an informative image needs a transcription");
    if (!o.informative && o.transcription.trim()) errors.push("leave the transcription empty when the image is not informative");
    if (o.transcription.length > MAX_TRANSCRIPTION) errors.push(`transcription longer than ${MAX_TRANSCRIPTION} characters`);
    return errors;
  },
};
