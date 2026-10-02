// Verbatim-excerpt check (the R4 idea, used for Quick Screen citations now and
// claim excerpts in M9): normalised substring match of an excerpt in a
// document's extracted text. Guarantees the excerpt exists, not that it
// supports the statement.

export function normaliseForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFound(text: string, excerpt: string): boolean {
  const needle = normaliseForMatch(excerpt);
  return needle.length > 0 && normaliseForMatch(text).includes(needle);
}
