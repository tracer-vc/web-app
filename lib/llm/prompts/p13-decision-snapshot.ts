import * as z from "zod";
import type { PromptDef } from "../types";
import { formatContext, itemErrors, itemSchema, type ItemLimits, type SynthesisContext } from "./synthesis-shared";

// Cite the decisive IDs, not every related one.
const LIMITS: ItemLimits = { maxClaims: 5, maxRefs: 8 };

// P13 Decision Snapshot statements (data_flow.html §04). The classification
// is computed by R3 and given; the three risks are the ranked counter-case
// arguments and are rendered from their rows (decisions 18, 42).

export type P13Input = SynthesisContext & {
  classification: "proceed" | "watch" | "pass";
  ruleApplied: string;
  thesisCard: { section: string; text: string }[];
};

const schema = z.object({
  justification: itemSchema.describe(
    "1–2 sentences justifying the given classification, naming the decisive dimensions by title with their scores.",
  ),
  supporting: z.array(itemSchema).describe("The three strongest evidence-based arguments for the outlier scenario."),
  research_agenda: z
    .array(
      itemSchema.extend({
        evidence: z.string().describe("The specific evidence that would resolve the question."),
      }),
    )
    .describe("3–7 open questions, each citing the uncertainty it addresses."),
  reeval_trigger: itemSchema.describe("The gating variable and the observable event or timeframe that calls for re-assessment."),
});

export type P13Output = z.infer<typeof schema>;

const LABEL = { proceed: "Proceed", watch: "Watch", pass: "Pass" } as const;

export const P13: PromptDef<P13Input, typeof schema> = {
  key: "P13",
  version: "1",
  name: "decision_snapshot",
  system: [
    "The classification is given (computed by rule). Justify it in 1–2 sentences citing dimension scores and claims; give three strongest supporting arguments, three primary risks, a 3–7 item research agenda with the evidence that would resolve each, and one re-evaluation trigger. All with IDs.",
    "The three primary risks are the ranked counter-case arguments, which are shown as they are; do not write them. Do not argue for a different classification.",
    "Each supporting argument is a single sentence resting on claims. Each research agenda item cites the uncertainty it addresses. Cite the decisive IDs only: at most 5 claims and 8 IDs per item. Put IDs only in the ID lists, never in the text. Write in English.",
  ].join("\n"),
  user: (i) =>
    [
      `Classification (computed by rule): ${LABEL[i.classification]}`,
      `Rule applied: ${i.ruleApplied}`,
      "",
      "Thesis Card:",
      ...i.thesisCard.map((s) => `${s.section}: ${s.text}`),
      "",
      formatContext(i),
    ].join("\n"),
  schema,
  validate: (o, i) => {
    const errors = [
      ...itemErrors(o.justification, i, "justification", "claim", LIMITS),
      ...o.supporting.flatMap((s, n) => itemErrors(s, i, `supporting ${n + 1}`, "claim", LIMITS)),
      ...o.research_agenda.flatMap((r, n) => itemErrors(r, i, `research ${n + 1}`, "uncertainty", LIMITS)),
      ...itemErrors(o.reeval_trigger, i, "reeval_trigger", "claim", LIMITS),
    ];
    if (o.supporting.length !== 3) errors.push(`give exactly three supporting arguments (got ${o.supporting.length})`);
    if (o.research_agenda.length < 3 || o.research_agenda.length > 7) {
      errors.push(`give 3–7 research agenda items (got ${o.research_agenda.length})`);
    }
    o.research_agenda.forEach((r, n) => {
      if (!r.evidence.trim()) errors.push(`research ${n + 1}: evidence is empty`);
    });
    return errors;
  },
};
