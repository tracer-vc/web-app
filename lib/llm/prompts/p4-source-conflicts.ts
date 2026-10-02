import * as z from "zod";
import { excerptFound } from "@/lib/excerpt";
import type { PromptDef } from "../types";

// P4 Source conflicts (data_flow.html §04). Passages are checked verbatim
// against the sources' full text (the R4 idea), so a conflict always quotes
// what the sources actually say.

export type P4Input = {
  sources: { ref: string; title: string; tier: string; party: string; text: string; fullText: string; truncated: boolean }[];
};

export const MAX_PASSAGE_LENGTH = 400;

const schema = z.object({
  conflicts: z.array(
    z.object({
      source_a: z.string().describe("Source reference, e.g. S1."),
      source_b: z.string().describe("The other source reference."),
      description: z.string().describe("One sentence naming what they disagree on."),
      passage_a: z.string().describe("Verbatim passage from source_a."),
      passage_b: z.string().describe("Verbatim passage from source_b."),
    }),
  ),
});

export const P4: PromptDef<P4Input, typeof schema> = {
  key: "P4",
  version: "2",
  name: "source_conflicts",
  system: [
    "Compare these sources' key passages. Report only material factual disagreements (numbers, dates, claims of fact), not differences of emphasis, opinion or level of detail.",
    "Different figures for the same quantity (e.g. number of customers, revenue, funding, headcount, deployments) are a disagreement even if the wording or the date differs slightly; say in the description what differs and, if visible, a possible reason (e.g. different dates). Deciding which source is right is left to the analyst.",
    `Quote both passages verbatim, copied character for character from the respective source (at most ${MAX_PASSAGE_LENGTH} characters each).`,
    "Report each disagreement once. If there are none, return an empty list.",
  ].join("\n"),
  user: ({ sources }) =>
    sources
      .map(
        (s) =>
          `=== ${s.ref}: ${s.title} (${s.tier}, party: ${s.party})${s.truncated ? " (truncated)" : ""} ===\n${s.text}\n=== end of ${s.ref} ===`,
      )
      .join("\n\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    const byRef = new Map(input.sources.map((s) => [s.ref, s]));
    const seen = new Set<string>();
    for (const c of o.conflicts) {
      const a = byRef.get(c.source_a);
      const b = byRef.get(c.source_b);
      if (!a || !b) {
        errors.push(`unknown source in ${c.source_a}/${c.source_b}`);
        continue;
      }
      if (c.source_a === c.source_b) errors.push(`${c.source_a} conflicts with itself`);
      if (!c.description.trim()) errors.push(`${c.source_a}/${c.source_b}: description is empty`);
      for (const [p, s] of [
        [c.passage_a, a],
        [c.passage_b, b],
      ] as const) {
        if (p.length > MAX_PASSAGE_LENGTH) errors.push(`${s.ref}: passage longer than ${MAX_PASSAGE_LENGTH} characters`);
        else if (!excerptFound(s.fullText, p)) errors.push(`${s.ref}: passage not found verbatim: "${p.slice(0, 80)}"`);
      }
      const key = [c.source_a, c.source_b].sort().join("|") + "|" + c.passage_a + "|" + c.passage_b;
      if (seen.has(key)) errors.push(`${c.source_a}/${c.source_b} reported twice`);
      seen.add(key);
    }
    return errors;
  },
};
