// Appends a document's visual content to its text as labelled blocks
// (decision 45) and returns each block's code-point range, so claims citing
// it can be traced back to the image. The existing text is kept unchanged
// (append only). No runtime imports, so `node --test` can load it directly.

export type VisualBlock = {
  position: number;
  locator: string; // "Page 3", "Slide 5 · image 2", "Slide 4 · chart 1"
  origin: "image" | "chart"; // AI transcription of an image, or chart data read from the file
  text: string;
};

export const SECTION_HEADING = "=== Visual content of this document ===";

const label = (b: VisualBlock) =>
  `[${b.locator} — ${b.origin === "image" ? "AI transcription of the image" : "chart data read from the file"}]`;

const cp = (s: string) => Array.from(s).length;

export function appendVisualSection(
  base: string | null,
  blocks: VisualBlock[],
): { text: string; ranges: { position: number; start: number; end: number }[] } {
  const original = base ?? "";
  if (!blocks.length) return { text: original, ranges: [] };
  let text = original + (original ? "\n\n" : "") + SECTION_HEADING + "\n";
  const ranges: { position: number; start: number; end: number }[] = [];
  for (const b of blocks) {
    const body = b.text.trim();
    text += `\n${label(b)}\n`;
    const start = cp(text);
    text += body + "\n";
    ranges.push({ position: b.position, start, end: start + cp(body) });
  }
  return { text, ranges };
}
