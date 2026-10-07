import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { citedText, type Block, type Cited, type RunDoc } from "./run-doc";

// RunDoc → PDF (A4) with pdf-lib's standard fonts: wrapped text, tables with
// a repeated header row, page numbers. Characters the standard fonts can't
// encode (WinAnsi) are mapped to close equivalents.

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 48, top: 52, bottom: 56 };
const WIDTH = A4.w - 2 * M.x;
const INK = rgb(0.055, 0.082, 0.188); // #0e1530
const MUTED = rgb(0.42, 0.42, 0.46);
const ACCENT = rgb(0.169, 0.294, 1); // #2b4bff
const RULE = rgb(0.86, 0.86, 0.9);

const MAP: Record<string, string> = {
  "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "≈": "~", "≠": "!=", "−": "-", "‐": "-", "‑": "-", "‒": "-",
  "✓": "v", "✗": "x", "⚠": "!", " ": " ", " ": " ", " ": " ", "​": "", "′": "'", "″": '"',
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont };

function sanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (s: string) =>
    Array.from(s.replace(/\r/g, ""))
      .map((ch) => {
        if (ch === "\n" || ch === "\t") return ch === "\t" ? " " : ch;
        const mapped = MAP[ch] ?? ch;
        return Array.from(mapped)
          .map((c) => (supported.has(c.codePointAt(0)!) ? c : (c.normalize("NFKD").replace(/[̀-ͯ]/g, "") || "?")))
          .map((c) => (supported.has(c.codePointAt(0)!) ? c : "?"))
          .join("");
      })
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // a single word wider than the line is broken by characters
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

class Writer {
  private pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;
  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: Fonts,
    private readonly clean: (s: string) => string,
    private readonly title: string,
  ) {
    this.newPage();
  }

  private newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M.top;
  }

  private ensure(height: number) {
    if (this.y - height < M.bottom) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  text(raw: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; lead?: number; prefix?: string } = {}) {
    const font = opts.font ?? this.fonts.regular;
    const size = opts.size ?? 9.5;
    const lead = opts.lead ?? size * 1.32;
    const indent = opts.indent ?? 0;
    const lines = wrap(this.clean(raw), font, size, WIDTH - indent);
    lines.forEach((line, i) => {
      this.ensure(lead);
      if (i === 0 && opts.prefix) {
        this.page.drawText(this.clean(opts.prefix), { x: M.x + indent - 14, y: this.y - size, size, font: this.fonts.regular, color: MUTED });
      }
      this.page.drawText(line, { x: M.x + indent, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lead;
    });
  }

  rule() {
    this.ensure(6);
    this.page.drawLine({ start: { x: M.x, y: this.y - 2 }, end: { x: M.x + WIDTH, y: this.y - 2 }, thickness: 0.6, color: RULE });
    this.y -= 6;
  }

  table(head: string[], rows: string[][], widths: number[]) {
    const size = 7.5;
    const lead = size * 1.3;
    const total = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / total) * WIDTH);
    const pad = 3;
    const drawRow = (cells: string[], font: PDFFont, color: ReturnType<typeof rgb>) => {
      const wrapped = cells.map((c, i) => wrap(this.clean(c ?? ""), font, size, cols[i] - 2 * pad));
      const height = Math.max(...wrapped.map((l) => l.length)) * lead + 2 * pad;
      return { wrapped, height, font, color };
    };
    const header = drawRow(head, this.fonts.bold, MUTED);
    const paint = (r: ReturnType<typeof drawRow>) => {
      let x = M.x;
      r.wrapped.forEach((lines, i) => {
        lines.forEach((line, k) => {
          this.page.drawText(line, { x: x + pad, y: this.y - pad - size - k * lead, size, font: r.font, color: r.color });
        });
        x += cols[i];
      });
      this.page.drawLine({ start: { x: M.x, y: this.y }, end: { x: M.x + WIDTH, y: this.y }, thickness: 0.5, color: RULE });
      this.y -= r.height;
    };
    this.ensure(header.height + lead * 2);
    paint(header);
    for (const cells of rows) {
      const r = drawRow(cells, this.fonts.regular, INK);
      if (this.y - r.height < M.bottom) {
        this.newPage();
        paint(header);
      }
      paint(r);
    }
    this.gap(6);
  }

  footer() {
    this.pages.forEach((p, i) => {
      const text = this.clean(`Tracer · ${this.title} · page ${i + 1} of ${this.pages.length}`);
      p.drawText(text, { x: M.x, y: 28, size: 7.5, font: this.fonts.regular, color: MUTED });
    });
  }
}

function cited(w: Writer, fonts: Fonts, c: Cited, indent = 0, prefix?: string) {
  w.text(citedText(c), { indent, prefix, font: fonts.regular });
}

export async function toPdf(doc: RunDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setProducer("Tracer");
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  const w = new Writer(pdf, fonts, sanitizer(fonts.regular), doc.title);
  for (const b of doc.blocks as Block[]) {
    switch (b.kind) {
      case "h1":
        w.text(b.text, { font: fonts.bold, size: 17, lead: 21 });
        break;
      case "h2":
        w.gap(8);
        w.text(b.text, { font: fonts.bold, size: 12.5, lead: 16 });
        w.rule();
        break;
      case "h3":
        w.gap(4);
        w.text(b.text.toUpperCase(), { font: fonts.bold, size: 7.5, lead: 11, color: ACCENT });
        break;
      case "meta":
        w.text(b.text, { font: fonts.italic, size: 8.5, color: MUTED });
        w.gap(2);
        break;
      case "p":
        cited(w, fonts, b.item);
        w.gap(2);
        break;
      case "list":
        b.items.forEach((item, i) => cited(w, fonts, item, 14, b.ordered ? `${i + 1}.` : "•"));
        w.gap(2);
        break;
      case "table":
        w.table(b.head, b.rows, b.widths);
        break;
    }
  }
  w.footer();
  return pdf.save();
}
