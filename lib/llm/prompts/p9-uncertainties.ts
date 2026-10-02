import * as z from "zod";
import type { PromptDef } from "../types";
import { formatClaimTable, type PromptClaim } from "./claim-table";

// P9 Uncertainty List (data_flow.html §04). The prompt-derived U# from step 3
// are already recorded; P9 adds questions the sources cannot answer, up to 10
// in total. No minimum and no padding (decision 17).

export type P9Input = {
  company: string;
  claims: PromptClaim[];
  prompts: { ref: string; question: string }[]; // Collection Prompts
  openConflicts: { code: string; description: string }[];
  recorded: { code: string; question: string }[]; // existing U#
  counterArguments: { rank: number; argument: string }[];
  maxNew: number;
};

const schema = z.object({
  uncertainties: z.array(
    z.object({
      question: z.string().describe("A specific open question about this company."),
      why_unresolved: z.string().describe("One sentence on why the current sources cannot answer it."),
      decision_critical: z.boolean().describe("Whether resolving it could change Proceed / Watch / Pass."),
      min_evidence: z.string().describe("The minimum evidence that would resolve it."),
    }),
  ),
});

export const P9: PromptDef<P9Input, typeof schema> = {
  key: "P9",
  version: "1",
  name: "uncertainty_list",
  system: [
    "List the questions the Source Table cannot answer, including the ones already recorded. For each: why it is unresolved, whether resolving it would change Proceed/Watch/Pass, and the minimum evidence that would resolve it.",
    "The recorded uncertainties are kept as they are: return only new questions that none of them already asks. Draw on the counter-case arguments, open conflicts, low-confidence claims and gaps in the Collection Prompts.",
    "Return at most the number of new questions allowed, and fewer or none if nothing important is missing; never pad the list. Each question is specific to this company and answerable with evidence. Write in English.",
  ].join("\n"),
  user: (i) =>
    [
      `Company under evaluation: ${i.company}`,
      `New questions allowed: at most ${i.maxNew}`,
      "",
      "Recorded uncertainties:",
      ...(i.recorded.length ? i.recorded.map((u) => `${u.code}: ${u.question}`) : ["(none)"]),
      "",
      "Counter-case arguments (strongest first):",
      ...i.counterArguments.map((a) => `${a.rank}. ${a.argument}`),
      "",
      "Open conflicts:",
      ...(i.openConflicts.length ? i.openConflicts.map((c) => `${c.code}: ${c.description}`) : ["(none)"]),
      "",
      "Collection Prompts:",
      ...i.prompts.map((p) => `${p.ref}. ${p.question}`),
      "",
      "Claim Table:",
      formatClaimTable(i.claims),
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    if (o.uncertainties.length > input.maxNew) {
      errors.push(`give at most ${input.maxNew} new questions (got ${o.uncertainties.length})`);
    }
    const recorded = new Set(input.recorded.map((u) => u.question.trim().toLowerCase()));
    o.uncertainties.forEach((u, i) => {
      const where = `uncertainty ${i + 1}`;
      if (!u.question.trim().endsWith("?")) errors.push(`${where}: question must end with '?'`);
      if (recorded.has(u.question.trim().toLowerCase())) errors.push(`${where}: repeats a recorded uncertainty`);
      if (!u.why_unresolved.trim()) errors.push(`${where}: why_unresolved is empty`);
      if (!u.min_evidence.trim()) errors.push(`${where}: min_evidence is empty`);
    });
    return errors;
  },
};
