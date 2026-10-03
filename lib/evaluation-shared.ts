// Evaluation constants and view types shared by server and client code.
import type { Enums } from "@/lib/supabase/database.types";

export type EvaluationStatus = Enums<"evaluation_status">;
export type Verdict = Enums<"verdict">;

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  screening: "Screening",
  passed: "Passed",
  watch: "Watch",
  collecting: "Evidence collection",
  extracting: "Claim extraction",
  stress_testing: "Counter-case",
  scoring: "Dimensions",
  synthesizing: "Synthesis",
  complete: "Complete",
};

export const VERDICT_LABELS: Record<Verdict, string> = { proceed: "Proceed", watch: "Watch", pass: "Pass" };

// Pipeline tabs on the deal page (ui_design.html). `step` matches evaluations.current_step.
export const PIPELINE_STEPS = [
  { key: "quick-screen", step: 1, label: "Quick Screen" },
  { key: "evidence", step: 2, label: "Evidence Collection" },
  { key: "claims", step: 3, label: "Claim Extraction" },
  { key: "counter-case", step: 4, label: "Counter-Case" },
  { key: "dimensions", step: 5, label: "Dimensions" },
] as const;
// Output documents (step 6), rendered from rows once synthesis has run.
export const OUTPUT_TABS = [
  { key: "thesis-card", step: 6, label: "Thesis Card" },
  { key: "decision-snapshot", step: 6, label: "Decision Snapshot" },
  { key: "evidence-pack", step: 6, label: "Evidence Pack" },
] as const;
export type PipelineTab = (typeof PIPELINE_STEPS)[number]["key"] | (typeof OUTPUT_TABS)[number]["key"];

// Statuses in which the Quick Screen can still be redone or overridden
// (mirrors private.is_quick_screen_status in the database).
export const QUICK_SCREEN_STATUSES: EvaluationStatus[] = ["screening", "passed", "watch", "collecting"];

// Only Proceed continues: later steps unlock once the pipeline reaches them.
export function isStepUnlocked(step: number, status: EvaluationStatus, currentStep: number): boolean {
  if (step === 1) return true;
  if (status === "passed" || status === "watch" || status === "screening") return false;
  return step <= currentStep;
}

export const MAX_ANSWER_LENGTH = 600;

// The answer P1a gives when the materials don't answer a question (decision 34).
export const NOT_STATED = "Not stated in the materials.";

export const MAX_DOCUMENTS = 20;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export type DocumentView = {
  id: string;
  filename: string;
  mimeType: string;
  bytes: number;
  status: "pending" | "extracted" | "no_text" | "failed";
  // Reading images, pages and charts (decision 45)
  visualStatus: "none" | "pending" | "running" | "done" | "failed";
  visualSummary: string | null;
  visualError: string | null;
  createdAt: string;
};

export type AnswerView = {
  answer: string;
  origin: "analyst" | "ai";
  aiAnswer: string | null;
  foundInMaterials: boolean | null;
  citations: { documentId: string; filename: string; excerpt: string }[];
};

export type MemoView = {
  thesis: string;
  verdict: Verdict;
  originalVerdict: Verdict;
  justification: string;
  uncertainties: string[];
  reopenCondition: string | null;
  gatingVariable: string | null;
  reevalTrigger: string | null;
  overridden: { by: string | null; at: string; reason: string } | null;
};

export type EvaluationView = {
  studyParentId: string | null; // set on hidden Study 2 copies
  studyRun: number | null;
  id: string;
  fundId: string;
  configId: string;
  status: EvaluationStatus;
  currentStep: number;
  uploadsOnly: boolean;
  updatedAt: string;
  company: { name: string; stage: string; sector: string; website: string };
  configVersion: number;
  evaluator: string | null;
  questions: { id: string; label: string; question: string }[];
  answers: Record<string, AnswerView>;
  documents: DocumentView[];
  memo: MemoView | null;
};

export type DealRow = {
  id: string;
  name: string;
  stage: string;
  sector: string;
  status: EvaluationStatus;
  currentStep: number;
  verdict: Verdict | null; // Quick Screen
  overridden: boolean;
  classification: Verdict | null; // R3, once outputs exist
  openConflicts: number;
  openCriticalUncertainties: number;
  configVersion: number;
  updatedAt: string;
};
