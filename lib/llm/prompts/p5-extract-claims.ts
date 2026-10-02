import * as z from "zod";
import { checkClaimExcerpts, type ExcerptIndex } from "@/lib/excerpt";
import type { PromptDef } from "../types";

// P5 Extract atomic claims (data_flow.html §04), once per source chunk
// (decision 24). R4 is part of validation: every Fact/Inference excerpt must
// be found verbatim in the source's full text, otherwise the call is retried
// (decision 37 for what survives a final failure).

export type P5Input = {
  company: string;
  source: { ref: string; title: string; tier: string; party: string };
  chunk: { text: string; part: number; parts: number };
  index: ExcerptIndex; // the source's full text
  prompts: { ref: string; question: string }[];
};

export const MAX_CLAIMS_PER_CHUNK = 6;
export const MAX_EXCERPT_LENGTH = 400;
export const MAX_STATEMENT_LENGTH = 300;

const schema = z.object({
  claims: z.array(
    z.object({
      statement: z.string().describe("One concrete, falsifiable proposition naming the company or subject."),
      type: z.enum(["fact", "inference", "speculation"]),
      excerpt: z
        .string()
        .describe("For fact/inference: the supporting passage copied verbatim from the text. For speculation: empty string."),
      prompt_refs: z.array(z.string()).describe("Collection Prompts the claim answers, e.g. P4."),
    }),
  ),
});

export type P5Claim = z.infer<typeof schema>["claims"][number];

// Rule checks other than R4, shared with the salvage path in the worker.
export function claimShapeErrors(c: P5Claim, refs: Set<string>): string[] {
  const errors: string[] = [];
  const label = `"${c.statement.slice(0, 60)}"`;
  if (!c.statement.trim()) errors.push("a statement is empty");
  else if (c.statement.length > MAX_STATEMENT_LENGTH) errors.push(`${label}: statement longer than ${MAX_STATEMENT_LENGTH} characters`);
  if (c.excerpt.length > MAX_EXCERPT_LENGTH) errors.push(`${label}: excerpt longer than ${MAX_EXCERPT_LENGTH} characters`);
  for (const r of c.prompt_refs) if (!refs.has(r)) errors.push(`${label}: unknown prompt reference ${r}`);
  if (new Set(c.prompt_refs).size !== c.prompt_refs.length) errors.push(`${label}: prompt_refs contains duplicates`);
  return errors;
}

export const P5: PromptDef<P5Input, typeof schema> = {
  key: "P5",
  version: "2",
  name: "extract_claims",
  system: [
    `From this single source extract the 2–${MAX_CLAIMS_PER_CHUNK} most decision-relevant statements about the company, its product, market, customers, team or competition (fewer only if the text holds fewer).`,
    "Rewrite each as one concrete, falsifiable proposition with the subject named (the company's name instead of \"we\"), and figures, dates and scope as stated.",
    "Claims are atomic: exactly one fact per claim. Never join separate facts with \"and\" (e.g. customer count and revenue, or two founders' backgrounds, are separate claims); if you must choose, keep the more decision-relevant one.",
    "Label each: fact (directly stated in the text), inference (follows from several statements in this text, not from outside knowledge) or speculation (a forecast, ambition or opinion that the text does not substantiate).",
    `For fact and inference, copy the supporting passage verbatim: the shortest contiguous span of the text that supports the claim, character for character, at most ${MAX_EXCERPT_LENGTH} characters. Do not paraphrase, shorten with ellipses or merge separate passages. For speculation, leave the excerpt empty.`,
    "Tag which Collection Prompts each claim answers (may be none). Do not use outside knowledge. Write the statements in English.",
  ].join("\n"),
  user: ({ company, source, chunk, prompts }) =>
    [
      `Company under evaluation: ${company}`,
      "",
      "Collection Prompts:",
      ...prompts.map((p) => `${p.ref}. ${p.question}`),
      "",
      `Source ${source.ref}: ${source.title} (${source.tier}, party: ${source.party})${chunk.parts > 1 ? ` — part ${chunk.part} of ${chunk.parts}` : ""}`,
      "=== source text ===",
      chunk.text,
      "=== end ===",
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    if (o.claims.length > MAX_CLAIMS_PER_CHUNK) errors.push(`give at most ${MAX_CLAIMS_PER_CHUNK} claims (got ${o.claims.length})`);
    const refs = new Set(input.prompts.map((p) => p.ref));
    for (const c of o.claims) errors.push(...claimShapeErrors(c, refs));
    for (const r of checkClaimExcerpts(input.index, o.claims).rejected) {
      errors.push(`"${r.statement.slice(0, 60)}": ${r.reason}${r.excerpt ? ` ("${r.excerpt.slice(0, 80)}")` : ""}`);
    }
    return errors;
  },
};
