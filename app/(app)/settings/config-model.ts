import type {
  ClassificationCriteria,
  ConfigView,
  ScoreAnchors,
  TierDefinitions,
} from "@/lib/config-shared";
import type { DimensionRow } from "./dimensions-section";
import type { Row } from "./sections";

// Shared by the Settings editor and the fund setup wizard.

// Editable copy of a config.
export type Model = {
  id: string;
  tiers: TierDefinitions;
  suff: { min: number; max: number; cap: number };
  anchors: ScoreAnchors;
  criteria: ClassificationCriteria;
  quick: Row<{ label: string; question: string }>[];
  prompts: Row<{ question: string; required: boolean }>[];
  counter: Row<{ prompt: string }>[];
  dims: DimensionRow[];
};

export const toModel = (c: ConfigView): Model => ({
  id: c.id,
  tiers: structuredClone(c.tierDefinitions),
  suff: {
    min: c.sufficiencyRule.claims_per_score.min,
    max: c.sufficiencyRule.claims_per_score.max,
    cap: c.sufficiencyRule.score_cap,
  },
  anchors: { ...c.scoreAnchors },
  criteria: structuredClone(c.classificationCriteria),
  quick: c.quickScreenQuestions.map((q) => ({ ...q, key: q.id })),
  prompts: c.collectionPrompts.map((p) => ({ ...p, key: p.id })),
  counter: c.counterCasePrompts.map((p) => ({ ...p, key: p.id })),
  dims: c.dimensions.map((d) => ({
    key: d.id,
    id: d.id,
    title: d.title,
    question: d.question,
    claimCoverage: d.claimCoverage,
    highScoreSignals: d.highScoreSignals,
    lowScoreSignals: d.lowScoreSignals,
    disqualifyingBelow: d.disqualifyingBelow,
    prompts: d.prompts.map((p) => ({ ...p, key: p.id })),
    required: [...d.requiredPromptIds],
  })),
});

// Body of PUT /api/settings/config. Required prompts are sent as positions
// because prompts added in this session have no id yet.
export const toBody = (m: Model) => ({
  id: m.id,
  tier_definitions: m.tiers,
  sufficiency_rule: { claims_per_score: { min: m.suff.min, max: m.suff.max }, score_cap: m.suff.cap },
  score_anchors: m.anchors,
  classification_criteria: m.criteria,
  quick_screen_questions: m.quick.map(({ id, label, question }) => ({ id, label, question })),
  collection_prompts: m.prompts.map(({ id, question, required }) => ({ id, question, required })),
  counter_case_prompts: m.counter.map(({ id, prompt }) => ({ id, prompt })),
  dimensions: m.dims.map((d) => ({
    id: d.id,
    title: d.title,
    question: d.question,
    claim_coverage: d.claimCoverage,
    high_score_signals: d.highScoreSignals,
    low_score_signals: d.lowScoreSignals,
    disqualifying_below: d.disqualifyingBelow,
    prompts: d.prompts.map(({ id, prompt }) => ({ id, prompt })),
    required_prompt_positions: m.prompts.flatMap((p, i) => (d.required.includes(p.key) ? [i + 1] : [])),
  })),
});

export async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}
