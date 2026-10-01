import "server-only";

import * as z from "zod";
import type { createClient } from "@/lib/supabase/server";
import {
  ANCHOR_KEYS,
  CLAIMS_PER_SCORE_LIMITS,
  MAX_QUICK_SCREEN_QUESTIONS,
  OPS,
  type ClassificationCriteria,
  type ConfidenceRules,
  type ConfigView,
  type ScoreAnchors,
  type SufficiencyRule,
  type TierDefinitions,
  type VersionSummary,
} from "@/lib/config-shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const byPosition = <T extends { position: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.position - b.position);

// RLS limits every query to the caller's fund.
export async function loadConfig(
  supabase: Supabase,
  filter: { id: string } | { version: number } | { active: true } | { draft: true },
): Promise<ConfigView | null> {
  let query = supabase
    .from("framework_configs")
    .select(
      `id, version, status, is_active, published_at,
       tier_definitions, confidence_rules, sufficiency_rule, score_anchors, classification_criteria,
       quick_screen_questions(id, position, label, question),
       collection_prompts(id, position, question, required),
       counter_case_prompts(id, position, prompt),
       dimensions(id, position, title, question, claim_coverage, high_score_signals,
         low_score_signals, disqualifying_below,
         dimension_prompts(id, position, prompt), dimension_required_prompts(prompt_id))`,
    );

  if ("id" in filter) query = query.eq("id", filter.id);
  else if ("version" in filter) query = query.eq("version", filter.version);
  else if ("active" in filter) query = query.eq("is_active", true);
  else query = query.eq("status", "draft");

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    version: data.version,
    status: data.status,
    isActive: data.is_active,
    publishedAt: data.published_at,
    tierDefinitions: data.tier_definitions as TierDefinitions,
    confidenceRules: data.confidence_rules as ConfidenceRules,
    sufficiencyRule: data.sufficiency_rule as SufficiencyRule,
    scoreAnchors: data.score_anchors as ScoreAnchors,
    classificationCriteria: data.classification_criteria as ClassificationCriteria,
    quickScreenQuestions: byPosition(data.quick_screen_questions).map(({ id, label, question }) => ({
      id,
      label,
      question,
    })),
    collectionPrompts: byPosition(data.collection_prompts).map(({ id, question, required }) => ({
      id,
      question,
      required,
    })),
    counterCasePrompts: byPosition(data.counter_case_prompts).map(({ id, prompt }) => ({ id, prompt })),
    dimensions: byPosition(data.dimensions).map((d) => ({
      id: d.id,
      title: d.title,
      question: d.question,
      claimCoverage: d.claim_coverage,
      highScoreSignals: d.high_score_signals,
      lowScoreSignals: d.low_score_signals,
      disqualifyingBelow: d.disqualifying_below,
      prompts: byPosition(d.dimension_prompts).map(({ id, prompt }) => ({ id, prompt })),
      requiredPromptIds: d.dimension_required_prompts.map((r) => r.prompt_id),
    })),
  };
}

export async function listVersions(supabase: Supabase): Promise<VersionSummary[]> {
  const { data, error } = await supabase
    .from("framework_configs")
    .select("id, version, status, is_active, published_at, created_at, author:profiles(display_name)")
    .order("version", { ascending: false });
  if (error) throw error;

  return data.map((c) => ({
    id: c.id,
    version: c.version,
    status: c.status,
    isActive: c.is_active,
    date: c.published_at ?? c.created_at,
    author: c.author?.display_name ?? null,
  }));
}

// Body of PUT /api/settings/config: the editor's full draft state.
// Counts and ranges are checked here for a clear message; the database
// enforces the structural ones (non-empty text, 7 questions, threshold 1-5) too.
const text = (max: number) =>
  z.string().trim().min(1, { error: "can't be empty" }).max(max, { error: `max ${max} characters` });
const optionalText = (max: number) => z.string().trim().max(max, { error: `max ${max} characters` });
const tier = z.object({ definition: text(2000), examples: text(1000) });

const score = z
  .number({ error: "enter a number" })
  .min(0, { error: "a score must be between 0 and 5" })
  .max(5, { error: "a score must be between 0 and 5" });
const count = z
  .number({ error: "enter a number" })
  .int({ error: "a count must be a whole number" })
  .min(0, { error: "a count can't be negative" })
  .max(100, { error: "a count must be at most 100" });

const predicate = z.union([
  z.object({ type: z.literal("any_dimension_disqualifying") }),
  z.object({ type: z.enum(["min_dimension_score", "avg_dimension_score"]), op: z.enum(OPS), value: score }),
  z.object({
    type: z.enum(["open_decision_critical_uncertainties", "open_conflicts"]),
    op: z.enum(OPS),
    value: count,
  }),
]);

const rule = <O extends "pass" | "watch">(outcome: O) =>
  z.object({
    outcome: z.literal(outcome),
    match: z.enum(["any", "all"]),
    predicates: z.array(predicate).min(1, { error: "add at least one condition" }).max(10),
    note: optionalText(1000),
  });

// Fixed order Pass -> Watch -> Proceed (decision 12). Proceed is the fallback
// and has no conditions (decision 33).
const classificationCriteria = z.object({
  rules: z.tuple([
    rule("pass"),
    rule("watch"),
    z.object({
      outcome: z.literal("proceed"),
      match: z.literal("all"),
      predicates: z.array(predicate).max(0, {
        error: "Proceed has no conditions: it applies when neither Pass nor Watch matches",
      }),
      note: optionalText(1000),
    }),
  ]),
});

const claimsLimit = z
  .number({ error: "enter a number" })
  .int({ error: "enter a whole number" })
  .min(CLAIMS_PER_SCORE_LIMITS.min, { error: `at least ${CLAIMS_PER_SCORE_LIMITS.min}` })
  .max(CLAIMS_PER_SCORE_LIMITS.max, { error: `at most ${CLAIMS_PER_SCORE_LIMITS.max}` });

const sufficiencyRule = z.object({
  claims_per_score: z
    .object({ min: claimsLimit, max: claimsLimit })
    .refine((r) => r.min <= r.max, { error: "the minimum can't be above the maximum" }),
  score_cap: z
    .number({ error: "enter a number" })
    .int({ error: "enter a whole number" })
    .min(1, { error: "the cap must be between 1 and 5" })
    .max(5, { error: "the cap must be between 1 and 5" }),
});

const dimension = z.object({
  id: z.uuid().optional(),
  title: text(120),
  question: text(1000),
  claim_coverage: optionalText(2000),
  high_score_signals: optionalText(2000),
  low_score_signals: optionalText(2000),
  disqualifying_below: z
    .number()
    .int()
    .min(1, { error: "the threshold must be between 1 and 5" })
    .max(5, { error: "the threshold must be between 1 and 5" })
    .nullable(),
  prompts: z.array(z.object({ id: z.uuid().optional(), prompt: text(1000) })).max(20),
  required_prompt_positions: z.array(z.number().int().min(1)).max(50),
});

const anchors = z.object({
  "0-1": text(1000),
  "2": text(1000),
  "3": text(1000),
  "4": text(1000),
  "5": text(1000),
} satisfies Record<(typeof ANCHOR_KEYS)[number], unknown>);

export const DraftSchema = z
  .object({
    id: z.uuid(),
    tier_definitions: z.object({ primary: tier, secondary: tier, tertiary: tier }),
    sufficiency_rule: sufficiencyRule,
    score_anchors: anchors,
    classification_criteria: classificationCriteria,
    quick_screen_questions: z
      .array(z.object({ id: z.uuid().optional(), label: text(120), question: text(1000) }))
      .max(MAX_QUICK_SCREEN_QUESTIONS, {
        error: `up to ${MAX_QUICK_SCREEN_QUESTIONS} Quick Screen questions`,
      }),
    collection_prompts: z
      .array(z.object({ id: z.uuid().optional(), question: text(1000), required: z.boolean() }))
      .max(50),
    counter_case_prompts: z.array(z.object({ id: z.uuid().optional(), prompt: text(1000) })).max(20),
    dimensions: z.array(dimension).max(20),
  })
  .superRefine((body, ctx) => {
    body.dimensions.forEach((d, i) =>
      d.required_prompt_positions.forEach((pos) => {
        if (pos > body.collection_prompts.length) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensions", i, "required_prompt_positions"],
            message: `refers to Collection Prompt ${pos}, which doesn't exist`,
          });
        }
      }),
    );
  });

export type DraftBody = z.infer<typeof DraftSchema>;

// ["dimensions", 2, "question"] -> "Dimension 3 · question"
const PATH_LABELS: Record<string, string> = {
  dimensions: "Dimension",
  quick_screen_questions: "Quick Screen question",
  collection_prompts: "Collection Prompt",
  counter_case_prompts: "Counter-Case Prompt",
  prompts: "concrete prompt",
  predicates: "condition",
};
const OUTCOME_BY_RULE_INDEX = ["Pass", "Watch", "Proceed"];

export function describeIssuePath(path: PropertyKey[]): string {
  const parts: string[] = [];
  path.forEach((seg, i) => {
    if (typeof seg === "number") return;
    const next = path[i + 1];
    if (seg === "rules" && typeof next === "number") parts.push(OUTCOME_BY_RULE_INDEX[next] ?? "rule");
    else if (seg === "classification_criteria") return;
    else if (PATH_LABELS[String(seg)] && typeof next === "number") parts.push(`${PATH_LABELS[String(seg)]} ${next + 1}`);
    else parts.push(String(seg).replaceAll("_", " "));
  });
  return parts.join(" · ") || "request";
}
