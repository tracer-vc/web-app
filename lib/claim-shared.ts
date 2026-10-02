// Claim Table view types shared by server and client code.
import type { ConfidenceBasis } from "@/lib/rules/confidence";
import type { RunView, Tier } from "@/lib/source-shared";
import type { Enums } from "@/lib/supabase/database.types";

export type ClaimType = Enums<"claim_type">;
export type Confidence = Enums<"claim_confidence">;

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = { fact: "Fact", inference: "Inference", speculation: "Speculation" };
export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

export type ClaimLinkView = {
  id: string;
  sourceId: string;
  sourceCode: string;
  sourceTitle: string;
  tier: Tier;
  party: string;
  excerpt: string;
  start: number; // code-point offsets in the source text
  end: number;
  markedWrong: boolean;
};

export type ClaimConflictView = {
  id: string;
  code: string;
  status: Enums<"conflict_status">;
  description: string;
  otherCode: string; // the contradicting claim's C#
  parentCode: string | null; // the source conflict it repeats
};

export type ClaimView = {
  id: string;
  code: string;
  statement: string;
  type: ClaimType;
  confidence: Confidence | null;
  basis: ConfidenceBasis | null;
  links: ClaimLinkView[];
  promptIds: string[];
  conflicts: ClaimConflictView[];
};

export type UncertaintyView = {
  id: string;
  code: string;
  question: string;
  whyUnresolved: string;
  decisionCritical: boolean;
  fromPrompt: number | null; // Collection Prompt position
  minEvidence: string | null;
  status: Enums<"uncertainty_status">;
};

export type ClaimTableView = {
  claims: ClaimView[];
  uncertainties: UncertaintyView[];
  prompts: { id: string; question: string }[];
  run: RunView | null;
};
