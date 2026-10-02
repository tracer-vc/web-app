import * as z from "zod";
import type { PromptDef } from "../types";
import { formatContext, itemErrors, itemSchema, type ItemLimits, type SynthesisContext } from "./synthesis-shared";

// The Thesis Card fits one printed page (app_summary.md): short items, few IDs.
export const THESIS_LIMITS: ItemLimits = { maxLength: 300, maxClaims: 5, maxRefs: 8 };
export const ITEM_LIMITS: ItemLimits = { maxLength: 260, maxClaims: 5, maxRefs: 8 };
export const MAX_DETAIL_LENGTH = 160;

// "Gating variables: X" -> "X" (the view adds the label).
export const stripLabel = (detail: string) => detail.replace(/^\s*(gating variables?|dominant failure mode)\s*:\s*/i, "").trim();

// P12 Thesis Card statements (data_flow.html §04; fields from app_summary.md).
// Falsifiers, dimension scores and open questions are rendered from their own
// rows (F#, D#, U#), not restated here (decision 42).

const scenario = itemSchema.extend({
  detail: z.string().describe("Gating variables (base/upside) or the dominant failure mode (failure case)."),
});

const schema = z.object({
  thesis: itemSchema.describe("One-sentence thesis: why the company can reach an outlier outcome, core mechanism and necessary conditions."),
  outlier: itemSchema.describe("Outlier scenario: outcome magnitude over 5–10 years and the mechanism that would produce it."),
  base_case: scenario,
  upside_case: scenario,
  failure_case: scenario.describe("Must match the strongest counter-case argument."),
  moat: itemSchema.describe("Moat mechanism, why it strengthens over time, 1–2 observable indicators."),
  entry_wedge: itemSchema.describe("Initial buyers and use case, sales motion or channel, adoption trigger."),
  milestones: z.array(itemSchema).describe("2–3 de-risking milestones: what, why it updates conviction, what evidence would prove it."),
});

export type P12Output = z.infer<typeof schema>;

export const P12: PromptDef<SynthesisContext, typeof schema> = {
  key: "P12",
  version: "1",
  name: "thesis_card",
  system: [
    "Fill each Thesis Card section in 1–2 sentences, assembled from the claims provided. Every sentence must list the claim IDs it rests on; a source ID may appear only next to a claim that cites it. Failure case must match the strongest counter argument. Do not introduce statements without a claim.",
    "Base and upside case each name 1–3 gating variables (external conditions that must resolve favourably) in `detail`; the failure case names the dominant failure mode in `detail`. Give 2–3 de-risking milestones, citing the uncertainties they would resolve.",
    `Be concise: the card must fit one printed page. The thesis is at most ${THESIS_LIMITS.maxLength} characters, every other item at most ${ITEM_LIMITS.maxLength}, each detail at most ${MAX_DETAIL_LENGTH}. Cite only the most relevant IDs: at most ${ITEM_LIMITS.maxClaims} claims and ${ITEM_LIMITS.maxRefs} IDs per item.`,
    "In `detail`, write only the variables or the failure mode, without a label such as \"Gating variables:\".",
    "Weigh low-confidence and speculative claims accordingly and do not hide open conflicts. Put IDs only in the ID lists, never in the text. Write in English.",
  ].join("\n"),
  user: (c) => formatContext(c),
  schema,
  validate: (o, c) => {
    const errors = [
      ...itemErrors(o.thesis, c, "thesis", "claim", THESIS_LIMITS),
      ...itemErrors(o.outlier, c, "outlier", "claim", ITEM_LIMITS),
      ...itemErrors(o.base_case, c, "base_case", "claim", ITEM_LIMITS),
      ...itemErrors(o.upside_case, c, "upside_case", "claim", ITEM_LIMITS),
      ...itemErrors(o.failure_case, c, "failure_case", "claim", ITEM_LIMITS),
      ...itemErrors(o.moat, c, "moat", "claim", ITEM_LIMITS),
      ...itemErrors(o.entry_wedge, c, "entry_wedge", "claim", ITEM_LIMITS),
      ...o.milestones.flatMap((m, i) => itemErrors(m, c, `milestone ${i + 1}`, "claim", ITEM_LIMITS)),
    ];
    for (const [k, s] of [
      ["base_case", o.base_case],
      ["upside_case", o.upside_case],
      ["failure_case", o.failure_case],
    ] as const) {
      if (!stripLabel(s.detail)) errors.push(`${k}: detail is empty`);
      else if (stripLabel(s.detail).length > MAX_DETAIL_LENGTH) errors.push(`${k}: detail longer than ${MAX_DETAIL_LENGTH} characters`);
    }
    if (o.milestones.length < 2 || o.milestones.length > 3) errors.push(`give 2–3 milestones (got ${o.milestones.length})`);
    // Decision 18: the failure case matches the strongest counter argument.
    const strongest = c.counterArguments.find((a) => a.rank === 1);
    if (strongest && !o.failure_case.claim_ids.some((id) => strongest.claimIds.includes(id))) {
      errors.push(`failure_case must rest on the strongest counter argument: cite at least one of ${strongest.claimIds.join(", ")}`);
    }
    return errors;
  },
};
