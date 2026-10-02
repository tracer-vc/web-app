// Verbatim-excerpt check (R4): normalised substring match of an excerpt in a
// source's full text. Guarantees the excerpt exists, not that it supports the
// statement. Normalisation (case, typographic quotes and dashes, whitespace)
// only forgives copy artefacts; reworded text never matches.
//
// Offsets are code-point positions in the original text (what Postgres
// length()/substr() count), so the database can check them and the UI can
// highlight the exact span.

const normaliseChar = (ch: string) =>
  ch
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...");

// Normalised text plus, per normalised character, the code-point span of the
// original character it came from.
function normalise(text: string): { norm: string; from: number[]; to: number[] } {
  let norm = "";
  const from: number[] = [];
  const to: number[] = [];
  let cp = 0;
  for (const ch of text) {
    for (const c of normaliseChar(ch)) {
      const add = /\s/.test(c) ? (norm.length === 0 || norm.endsWith(" ") ? "" : " ") : c;
      norm += add;
      // one entry per UTF-16 unit of `norm` (indexOf counts in those units)
      for (let i = 0; i < add.length; i++) {
        from.push(cp);
        to.push(cp + 1);
      }
    }
    cp++;
  }
  return { norm, from, to };
}

export type ExcerptSpan = { start: number; end: number };

// Normalise a source text once and look up several excerpts in it.
// (No TypeScript-only syntax such as parameter properties: `node --test`
// loads this file with type stripping.)
export class ExcerptIndex {
  readonly text: string;
  private readonly norm: string;
  private readonly from: number[];
  private readonly to: number[];

  constructor(text: string) {
    this.text = text;
    ({ norm: this.norm, from: this.from, to: this.to } = normalise(text));
  }

  find(excerpt: string): ExcerptSpan | null {
    const needle = normalise(excerpt).norm.trimEnd();
    if (!needle) return null;
    const at = this.norm.indexOf(needle);
    if (at < 0) return null;
    return { start: this.from[at], end: this.to[at + needle.length - 1] };
  }
}

export function findExcerpt(text: string, excerpt: string): ExcerptSpan | null {
  return new ExcerptIndex(text).find(excerpt);
}

export function excerptFound(text: string, excerpt: string): boolean {
  return findExcerpt(text, excerpt) !== null;
}

// The original text between two code-point offsets.
export function sliceCodePoints(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

// R4 over a batch of extracted claims: a Fact or Inference keeps its claim
// only if its excerpt is found in the source text; a Speculation carries no
// excerpt. Kept claims get the span and the verbatim original passage.
export function checkClaimExcerpts<T extends { type: string; excerpt: string }>(
  index: ExcerptIndex,
  claims: T[],
): {
  kept: (T & { span: ExcerptSpan | null; verbatim: string | null })[];
  rejected: (T & { reason: string })[];
} {
  const kept: (T & { span: ExcerptSpan | null; verbatim: string | null })[] = [];
  const rejected: (T & { reason: string })[] = [];
  for (const c of claims) {
    if (c.type === "speculation") {
      if (c.excerpt.trim()) rejected.push({ ...c, reason: "a speculation carries no excerpt" });
      else kept.push({ ...c, span: null, verbatim: null });
      continue;
    }
    if (!c.excerpt.trim()) {
      rejected.push({ ...c, reason: `a ${c.type} needs a verbatim excerpt` });
      continue;
    }
    const span = index.find(c.excerpt);
    if (!span) rejected.push({ ...c, reason: "excerpt not found verbatim in the source" });
    else kept.push({ ...c, span, verbatim: sliceCodePoints(index.text, span.start, span.end) });
  }
  return { kept, rejected };
}
