import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { RunView, SourceTableView } from "@/lib/source-shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Source Table, the deal's Collection Prompts and the latest Source Table run
// (RLS: the caller's fund only).
export async function loadSourceTable(supabase: Supabase, evaluationId: string, configId: string): Promise<SourceTableView> {
  const [
    { data: sources, error: sErr },
    { data: prompts, error: pErr },
    { data: runs, error: rErr },
    { data: conflicts, error: cErr },
  ] = await Promise.all([
    supabase
      .from("sources")
      .select(
        "id, code, origin, title, url, tier, party, published_at, accessed_at, relevance_note, document:documents(filename), coverage:source_prompt_coverage(prompt_id)",
      )
      .eq("evaluation_id", evaluationId),
    supabase.from("collection_prompts").select("id, question, required").eq("config_id", configId).order("position"),
    supabase
      .from("pipeline_runs")
      .select("id, status, progress, error, warnings, notes")
      .eq("evaluation_id", evaluationId)
      .eq("step", 2)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("conflicts")
      .select("id, code, side_a_id, side_b_id, description, passage_a, passage_b, status")
      .eq("evaluation_id", evaluationId)
      .eq("kind", "source"),
  ]);
  if (sErr) throw sErr;
  if (cErr) throw cErr;
  if (pErr) throw pErr;
  if (rErr) throw rErr;

  const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));
  const run = runs[0];
  const sourceCode = new Map(sources.map((s) => [s.id, s.code]));
  return {
    sources: [...sources]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map((s) => ({
        id: s.id,
        code: s.code,
        origin: s.origin,
        title: s.title,
        filename: s.document?.filename ?? null,
        url: s.url,
        tier: s.tier,
        party: s.party,
        publishedAt: s.published_at,
        accessedAt: s.accessed_at,
        relevanceNote: s.relevance_note,
        promptIds: s.coverage.map((c) => c.prompt_id),
      })),
    conflicts: [...conflicts]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map((c) => ({
        id: c.id,
        code: c.code,
        sideA: sourceCode.get(c.side_a_id) ?? "?",
        sideB: sourceCode.get(c.side_b_id) ?? "?",
        description: c.description,
        passageA: c.passage_a,
        passageB: c.passage_b,
        status: c.status,
      })),
    prompts,
    run: run ? (toRunView(run) satisfies RunView) : null,
  };
}

function toRunView(r: {
  id: string;
  status: RunView["status"];
  progress: number;
  error: string | null;
  warnings: string[];
  notes: string[];
}): RunView {
  return { id: r.id, status: r.status, progress: r.progress, error: r.error, warnings: r.warnings, notes: r.notes };
}
