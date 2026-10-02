// Claim Table assembly between P5/P6 and record_claims: applying merges,
// R2 coverage and linking claim conflicts to the source conflicts they repeat.
// Pure functions (no runtime imports), unit-tested with `node --test`.

export type ClaimType = "fact" | "inference" | "speculation";
export type Link = { source_id: string; excerpt: string; start: number; end: number };

export type Candidate = {
  ref: string; // K1…, temporary until C# is assigned
  type: ClaimType;
  statement: string;
  promptIds: string[];
  links: Link[]; // one per candidate from P5; empty for speculation
};

export type MergedClaim = Omit<Candidate, "ref"> & { refs: string[] };

// Apply P6 merges: each group collapses into its kept claim, which takes the
// union of the group's evidence links and prompts. Order follows the
// candidates (so C# follows sources and extraction order). Returns the merged
// claims and, per candidate ref, the index of the claim it ended up in.
export function applyMerges(
  candidates: Candidate[],
  merges: { keep: string; drop: string[] }[],
): { claims: MergedClaim[]; indexOf: Map<string, number> } {
  const keepOf = new Map<string, string>();
  for (const m of merges) for (const d of m.drop) keepOf.set(d, m.keep);
  const byRef = new Map(candidates.map((c) => [c.ref, c]));

  const claims: MergedClaim[] = [];
  const indexOf = new Map<string, number>();
  for (const c of candidates) {
    if (keepOf.has(c.ref)) continue;
    const group = [c, ...merges.filter((m) => m.keep === c.ref).flatMap((m) => m.drop.map((d) => byRef.get(d)!))];
    const links: Link[] = [];
    for (const l of group.flatMap((g) => g.links)) {
      if (!links.some((x) => x.source_id === l.source_id && x.start === l.start && x.end === l.end)) links.push(l);
    }
    const index = claims.length;
    claims.push({
      refs: group.map((g) => g.ref),
      type: c.type,
      statement: c.statement,
      promptIds: [...new Set(group.flatMap((g) => g.promptIds))],
      links,
    });
    for (const g of group) indexOf.set(g.ref, index);
  }
  return { claims, indexOf };
}

// R2 (decision 16, locked): only a Fact or Inference answers a prompt; a
// required prompt without one becomes an uncertainty.
export function uncoveredRequiredPrompts<P extends { id: string; required: boolean }>(
  claims: { type: ClaimType; promptIds: string[] }[],
  prompts: P[],
): P[] {
  const covered = new Set(claims.filter((c) => c.type !== "speculation").flatMap((c) => c.promptIds));
  return prompts.filter((p) => p.required && !covered.has(p.id));
}

// A claim conflict repeats a source conflict when one claim cites one side
// and the other claim cites the other side.
export function parentSourceConflict(
  a: { links: Link[] },
  b: { links: Link[] },
  sourceConflicts: { id: string; sideA: string; sideB: string }[],
): string | null {
  const sa = new Set(a.links.map((l) => l.source_id));
  const sb = new Set(b.links.map((l) => l.source_id));
  const match = sourceConflicts.find(
    (c) => (sa.has(c.sideA) && sb.has(c.sideB)) || (sa.has(c.sideB) && sb.has(c.sideA)),
  );
  return match?.id ?? null;
}

// The claims closest to a prompt by shared words (context for P7).
export function nearestStatements(question: string, statements: string[], limit = 5): string[] {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  const q = words(question);
  return statements
    .map((s) => ({ s, score: [...words(s)].filter((w) => q.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.s);
}
