import "server-only";

import * as z from "zod";
import type { createClient } from "@/lib/supabase/server";
import type { ConfigView, TierDefinitions, VersionSummary } from "@/lib/config-shared";
import { MAX_QUICK_SCREEN_QUESTIONS } from "@/lib/config-shared";

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
      `id, version, status, is_active, published_at, tier_definitions,
       quick_screen_questions(id, position, label, question),
       collection_prompts(id, position, question, required),
       counter_case_prompts(id, position, prompt),
       dimensions(id, position, title, dimension_prompts(id))`,
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
      promptCount: d.dimension_prompts.length,
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

// Body of PUT /api/settings/config: the editor's draft state (M3 fields).
// Counts are checked here for a clear message; the database enforces them too.
const text = (max: number) =>
  z.string().trim().min(1, { error: "can't be empty" }).max(max, { error: `max ${max} characters` });
const tier = z.object({ definition: text(2000), examples: text(1000) });

export const DraftSchema = z.object({
  id: z.uuid(),
  tier_definitions: z.object({ primary: tier, secondary: tier, tertiary: tier }),
  quick_screen_questions: z
    .array(z.object({ id: z.uuid().optional(), label: text(120), question: text(1000) }))
    .max(MAX_QUICK_SCREEN_QUESTIONS, {
      error: `up to ${MAX_QUICK_SCREEN_QUESTIONS} Quick Screen questions`,
    }),
  collection_prompts: z
    .array(z.object({ id: z.uuid().optional(), question: text(1000), required: z.boolean() }))
    .max(50),
  counter_case_prompts: z.array(z.object({ id: z.uuid().optional(), prompt: text(1000) })).max(20),
});

export type DraftBody = z.infer<typeof DraftSchema>;
