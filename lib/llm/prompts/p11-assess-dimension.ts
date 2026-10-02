import * as z from "zod";
import type { ScoreAnchors } from "@/lib/config-shared";
import type { PromptDef } from "../types";
import { formatClaimTable, unknownIds, type PromptClaim } from "./claim-table";

// P11 Assess dimension (data_flow.html §04), once per dimension. The score is
// the model's proposal; the database applies the score cap (decision 15) and
// the claims-per-score range is checked here and again at commit (decision 16).

export type P11Input = {
  company: string;
  dimension: {
    title: string;
    question: string;
    claimCoverage: string;
    highSignals: string;
    lowSignals: string;
    disqualifyingBelow: number | null;
  };
  prompts: { ref: string; prompt: string }[]; // the dimension's concrete prompts, "Q1"…
  anchors: ScoreAnchors;
  claims: PromptClaim[];
  openConflicts: { code: string; description: string }[];
  uncertainties: { code: string; question: string; decisionCritical: boolean }[];
  range: { min: number; max: number };
};

const schema = z.object({
  answers: z.array(
    z.object({
      prompt_ref: z.string().describe("Concrete prompt reference, e.g. Q1."),
      answer: z.string().describe("The answer from the Claim Table, or a statement that the claims do not answer it."),
      claim_ids: z.array(z.string()).describe("C# the answer rests on."),
    }),
  ),
  counter_signal: z.string().describe("The strongest signal against a high score on this dimension."),
  score: z.number().int().describe("0–5 per the anchor definitions."),
  justification_claim_ids: z.array(z.string()).describe("The C# that justify the score."),
});

export type P11Output = z.infer<typeof schema>;

export const P11: PromptDef<P11Input, typeof schema> = {
  key: "P11",
  version: "1",
  name: "assess_dimension",
  system: [
    "Answer each concrete prompt of this dimension using only claims from the table (cite C#). Name the strongest counter-signal. Score 0–5 using the fund's anchor definitions verbatim; justify with 2–5 claim IDs. Weigh Low-confidence and Speculation claims accordingly and note open conflicts.",
    "If the claims do not answer a prompt, say so plainly in the answer instead of filling the gap from outside knowledge; an unanswered prompt argues for a lower score.",
    "Put the claim IDs only in claim_ids, not in the answer text: they are shown as links next to it.",
    "The counter-signal is the most important evidence or gap against this dimension, specific to this company. Pick the score whose anchor definition fits best, and cite the claims that justify it. Write in English.",
  ].join("\n"),
  user: (i) =>
    [
      `Company under evaluation: ${i.company}`,
      "",
      `Dimension: ${i.dimension.title}`,
      `Question: ${i.dimension.question}`,
      ...(i.dimension.claimCoverage ? [`What the claims should cover: ${i.dimension.claimCoverage}`] : []),
      ...(i.dimension.highSignals ? [`High-score signals: ${i.dimension.highSignals}`] : []),
      ...(i.dimension.lowSignals ? [`Low-score signals: ${i.dimension.lowSignals}`] : []),
      ...(i.dimension.disqualifyingBelow !== null ? [`Disqualifying below: ${i.dimension.disqualifyingBelow}`] : []),
      "",
      "Concrete prompts:",
      ...i.prompts.map((p) => `${p.ref}. ${p.prompt}`),
      "",
      "Score anchors:",
      ...Object.entries(i.anchors).map(([k, v]) => `${k}: ${v}`),
      "",
      `Cite ${i.range.min}–${i.range.max} distinct claims as justification for the score.`,
      "",
      "Open conflicts:",
      ...(i.openConflicts.length ? i.openConflicts.map((c) => `${c.code}: ${c.description}`) : ["(none)"]),
      "",
      "Uncertainty List:",
      ...(i.uncertainties.length
        ? i.uncertainties.map((u) => `${u.code}${u.decisionCritical ? " (decision-critical)" : ""}: ${u.question}`)
        : ["(none)"]),
      "",
      "Claim Table:",
      formatClaimTable(i.claims),
    ].join("\n"),
  schema,
  validate: (o, input) => {
    const errors: string[] = [];
    const codes = new Set(input.claims.map((c) => c.code));
    const refs = new Set(input.prompts.map((p) => p.ref));
    const answered = o.answers.map((a) => a.prompt_ref);
    for (const p of input.prompts) {
      const n = answered.filter((r) => r === p.ref).length;
      if (n !== 1) errors.push(`answer prompt ${p.ref} exactly once (got ${n})`);
    }
    for (const a of o.answers) {
      if (!refs.has(a.prompt_ref)) errors.push(`unknown prompt ${a.prompt_ref}`);
      if (!a.answer.trim()) errors.push(`${a.prompt_ref}: answer is empty`);
      else if (/\bC\d+\b/.test(a.answer)) errors.push(`${a.prompt_ref}: put claim IDs in claim_ids, not in the answer text`);
      errors.push(...unknownIds(a.claim_ids, codes, "claim", a.prompt_ref));
    }
    if (!o.counter_signal.trim()) errors.push("counter_signal is empty");
    if (o.score < 0 || o.score > 5) errors.push(`score must be 0–5 (got ${o.score})`);
    const justification = [...new Set(o.justification_claim_ids)];
    if (justification.length < input.range.min || justification.length > input.range.max) {
      errors.push(`cite ${input.range.min}–${input.range.max} distinct claims for the score (got ${justification.length})`);
    }
    errors.push(...unknownIds(justification, codes, "claim", "justification"));
    return errors;
  },
};
