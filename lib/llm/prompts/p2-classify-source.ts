import * as z from "zod";
import type { TierDefinitions } from "@/lib/config-shared";
import type { PromptDef } from "../types";

// P2 Classify source (data_flow.html §04): relevance, covered Collection
// Prompts, tier (by origin), date, authoring party, relevance note, title.

export type P2Input = {
  company: string;
  tiers: TierDefinitions;
  prompts: { ref: string; question: string }[];
  document: { filename: string; text: string; truncated: boolean };
};

const schema = z.object({
  relevant: z.boolean().describe("false if the document says nothing useful about the company or its market."),
  title: z.string().describe("A short descriptive title for the document."),
  tier: z.enum(["primary", "secondary", "tertiary"]),
  published_at: z
    .string()
    .nullable()
    .describe("Publication date stated in the document as YYYY-MM-DD (use the 1st for month-only dates); null if none is stated."),
  party: z.string().describe("Who authored or published it, e.g. the company's name, the publication, or the blog."),
  prompt_refs: z.array(z.string()).describe("References of the Collection Prompts this document provides information on, e.g. P2."),
  relevance_note: z.string().describe("One line on what the document contributes."),
});

export type P2Output = z.infer<typeof schema>;

export const P2: PromptDef<P2Input, typeof schema> = {
  key: "P2",
  version: "1",
  name: "classify_source",
  system: [
    "You classify one document for a venture fund's Source Table.",
    "Given the fund's tier definitions and Collection Prompts, decide whether this document is relevant, which prompts it can inform, its tier, the publication date if stated, the authoring party, and a one-line relevance note.",
    "Assign the tier by origin (who produced it and how directly), not by quality or credibility: company-produced material is Primary even if it is promotional.",
    "The party decides which sources count as independent, so name the organisation or person that authored or published the document, and use the same name for the same party (e.g. the company's own deck and founder bios share the company's name).",
    "Only list prompts the document actually gives information on. Do not use outside knowledge. Write in English.",
  ].join("\n"),
  user: ({ company, tiers, prompts, document }) =>
    [
      `Company under evaluation: ${company}`,
      "",
      "Tier definitions:",
      ...(["primary", "secondary", "tertiary"] as const).map(
        (t) => `- ${t}: ${tiers[t].definition} Examples: ${tiers[t].examples}`,
      ),
      "",
      "Collection Prompts:",
      ...prompts.map((p) => `${p.ref}. ${p.question}`),
      "",
      `Document: ${document.filename}${document.truncated ? " (truncated: only the beginning is shown)" : ""}`,
      "=== document text ===",
      document.text,
      "=== end ===",
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    const refs = new Set(input.prompts.map((p) => p.ref));
    for (const r of o.prompt_refs) if (!refs.has(r)) errors.push(`unknown prompt reference ${r}`);
    if (new Set(o.prompt_refs).size !== o.prompt_refs.length) errors.push("prompt_refs contains duplicates");
    if (o.published_at !== null) {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(o.published_at) && !Number.isNaN(Date.parse(o.published_at));
      if (!ok) errors.push(`published_at must be YYYY-MM-DD or null (got "${o.published_at}")`);
    }
    if (o.relevant) {
      if (!o.title.trim()) errors.push("title is empty");
      if (!o.party.trim()) errors.push("party is empty");
      if (!o.relevance_note.trim()) errors.push("relevance_note is empty");
    }
    return errors;
  },
};
