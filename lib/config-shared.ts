// Config constants and view types shared by server and client code.
import type { Enums } from "@/lib/supabase/database.types";

export const TIERS = ["primary", "secondary", "tertiary"] as const;
export type Tier = (typeof TIERS)[number];
export type TierDefinitions = Record<Tier, { definition: string; examples: string }>;

export const MAX_QUICK_SCREEN_QUESTIONS = 7;

// R1 confidence rules (decision 9). Fixed mechanism: shown, never edited.
export type ConfidenceRules = {
  evaluation: "first_match";
  // A level matches when the claim's sources come from at least `min_parties`
  // distinct parties, of which at least `min_parties_in_tiers.min` have a
  // source in one of the listed tiers. Levels run best to worst.
  levels: {
    level: "high" | "medium" | "low";
    description: string;
    min_parties?: number;
    min_parties_in_tiers?: { tiers: Tier[]; min: number };
  }[];
  open_conflict_downgrade: number;
  independence: string;
};

// R2 sufficiency rule (decision 16). `locked` rules are fixed; the claims
// range and the score cap are editable per fund.
export type SufficiencyRule = {
  locked: { id: string; rule: string }[];
  claims_per_score: { min: number; max: number };
  score_cap: number;
};
export const CLAIMS_PER_SCORE_LIMITS = { min: 1, max: 10 } as const;

export const ANCHOR_KEYS = ["0-1", "2", "3", "4", "5"] as const;
export type ScoreAnchors = Record<(typeof ANCHOR_KEYS)[number], string>;

// R3 classification (decisions 12, 33): rules are evaluated Pass -> Watch ->
// Proceed, first match wins; Proceed applies when neither Pass nor Watch
// matches, so it carries no conditions.
export const OUTCOMES = ["pass", "watch", "proceed"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OPS = ["<", "<=", "=", ">=", ">"] as const;
export type Op = (typeof OPS)[number];

export const PREDICATE_TYPES = {
  any_dimension_disqualifying: { label: "Any dimension scores below its disqualifying threshold", kind: "flag" },
  min_dimension_score: { label: "Lowest dimension score", kind: "score" },
  avg_dimension_score: { label: "Average dimension score", kind: "score" },
  open_decision_critical_uncertainties: { label: "Open decision-critical uncertainties", kind: "count" },
  open_conflicts: { label: "Open conflicts", kind: "count" },
} as const;
export type PredicateType = keyof typeof PREDICATE_TYPES;
export type Predicate =
  | { type: "any_dimension_disqualifying" }
  | { type: Exclude<PredicateType, "any_dimension_disqualifying">; op: Op; value: number };

export type ClassificationRule = {
  outcome: Outcome;
  match: "any" | "all";
  predicates: Predicate[];
  note: string;
};
export type ClassificationCriteria = { rules: ClassificationRule[] };

// Next-step actions are performed by the system and not editable (app_summary.md).
export const NEXT_STEP_ACTIONS: Record<Outcome, string> = {
  pass: "Discontinue assessment. Record the dominant structural reason and one concrete condition under which the case would be re-opened.",
  watch:
    "Specify the gating variable, an event- or time-based trigger for re-evaluation, and the minimal evidence that would justify proceeding.",
  proceed: "Proceed to full evaluation: Evidence Pack → Dimension Scoring → Thesis Card + Decision Snapshot.",
};

export type DimensionView = {
  id: string;
  title: string;
  question: string;
  claimCoverage: string;
  highScoreSignals: string;
  lowScoreSignals: string;
  disqualifyingBelow: number | null;
  prompts: { id: string; prompt: string }[];
  requiredPromptIds: string[];
};

// A framework config with its child lists, ordered by position.
export type ConfigView = {
  id: string;
  version: number;
  status: Enums<"config_status">;
  isActive: boolean;
  publishedAt: string | null;
  tierDefinitions: TierDefinitions;
  confidenceRules: ConfidenceRules;
  sufficiencyRule: SufficiencyRule;
  scoreAnchors: ScoreAnchors;
  classificationCriteria: ClassificationCriteria;
  quickScreenQuestions: { id: string; label: string; question: string }[];
  collectionPrompts: { id: string; question: string; required: boolean }[];
  counterCasePrompts: { id: string; prompt: string }[];
  dimensions: DimensionView[];
};

export type VersionSummary = {
  id: string;
  version: number;
  status: Enums<"config_status">;
  isActive: boolean;
  date: string;
  author: string | null;
};
