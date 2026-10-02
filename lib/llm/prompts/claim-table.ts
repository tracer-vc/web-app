// The Claim Table as prompt input (P8–P10; later P11–P13): one line per claim
// with its C#, type, confidence, sources and open conflicts, so the model can
// cite only IDs that exist and weigh weak evidence accordingly.

export type PromptClaim = {
  code: string;
  type: "fact" | "inference" | "speculation";
  confidence: "high" | "medium" | "low" | null;
  statement: string;
  sources: string[]; // S#
  openConflicts: string[]; // CR# still open
};

export function formatClaimTable(claims: PromptClaim[]): string {
  return claims
    .map((c) => {
      const tags = [c.type, c.confidence ? `${c.confidence} confidence` : "no evidence link", c.sources.join(", ") || null]
        .filter(Boolean)
        .join(" · ");
      const conflict = c.openConflicts.length ? ` [open conflict ${c.openConflicts.join(", ")}]` : "";
      return `${c.code} (${tags})${conflict}: ${c.statement}`;
    })
    .join("\n");
}

// Cited IDs that are not in the given set, as rule violations (decision 25).
export function unknownIds(ids: string[], known: Set<string>, what: string, where: string): string[] {
  return ids.filter((id) => !known.has(id)).map((id) => `${where}: unknown ${what} ${id}`);
}
