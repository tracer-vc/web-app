// Source Table view types shared by server and client code.
import type { Enums } from "@/lib/supabase/database.types";

export type Tier = Enums<"source_tier">;
export const TIER_LABELS: Record<Tier, string> = { primary: "Primary", secondary: "Secondary", tertiary: "Tertiary" };

export type SourceView = {
  id: string;
  code: string;
  origin: Enums<"source_origin">;
  title: string;
  filename: string | null;
  url: string | null;
  tier: Tier;
  party: string;
  publishedAt: string | null;
  accessedAt: string;
  relevanceNote: string;
  promptIds: string[];
};

export type RunView = {
  id: string;
  status: Enums<"run_status">;
  progress: number;
  error: string | null;
  warnings: string[];
  notes: string[];
};

export type SourceConflictView = {
  id: string;
  code: string;
  sideA: string; // S#
  sideB: string;
  description: string;
  passageA: string;
  passageB: string;
  status: Enums<"conflict_status">;
};

export type SourceTableView = {
  sources: SourceView[];
  conflicts: SourceConflictView[];
  prompts: { id: string; question: string; required: boolean }[];
  run: RunView | null;
};

export const isRunActive = (run: RunView | null) => run?.status === "queued" || run?.status === "running";
