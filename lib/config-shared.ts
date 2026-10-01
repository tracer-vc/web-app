// Config constants and view types shared by server and client code.
import type { Enums } from "@/lib/supabase/database.types";

export const TIERS = ["primary", "secondary", "tertiary"] as const;
export type Tier = (typeof TIERS)[number];
export type TierDefinitions = Record<Tier, { definition: string; examples: string }>;

export const MAX_QUICK_SCREEN_QUESTIONS = 7;

// A framework config with its child lists, ordered by position.
export type ConfigView = {
  id: string;
  version: number;
  status: Enums<"config_status">;
  isActive: boolean;
  publishedAt: string | null;
  tierDefinitions: TierDefinitions;
  quickScreenQuestions: { id: string; label: string; question: string }[];
  collectionPrompts: { id: string; question: string; required: boolean }[];
  counterCasePrompts: { id: string; prompt: string }[];
  dimensions: { id: string; title: string; promptCount: number }[];
};

export type VersionSummary = {
  id: string;
  version: number;
  status: Enums<"config_status">;
  isActive: boolean;
  date: string;
  author: string | null;
};
