// Dimensions tab view types shared by server and client code (step 5).
import type { RunView } from "@/lib/source-shared";

export type DimensionAnswerView = { prompt: string; answer: string; claimCodes: string[] };

export type DimensionAssessmentView = {
  id: string;
  code: string; // D#
  title: string;
  question: string;
  disqualifyingBelow: number | null;
  answers: DimensionAnswerView[];
  counterSignal: string;
  proposedScore: number;
  score: number; // after the cap
  cappedBy: string | null; // U#
  anchor: string; // anchor text for the shown score
  claimCodes: string[]; // justification
  override: { score: number; reason: string | null; by: string | null; at: string | null } | null;
};

export type DimensionsView = {
  assessments: DimensionAssessmentView[];
  dimensionCount: number; // dimensions of the pinned config
  range: { min: number; max: number };
  scoreCap: number;
  run: RunView | null;
};

// The score that counts: the analyst's override if any, else the (capped) score.
export const effectiveScore = (a: DimensionAssessmentView) => a.override?.score ?? a.score;

export const anchorKey = (score: number) => (score <= 1 ? "0-1" : String(score)) as "0-1" | "2" | "3" | "4" | "5";
