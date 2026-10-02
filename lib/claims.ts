import "server-only";

import type { ClaimTableView } from "@/lib/claim-shared";
import type { ConfidenceBasis } from "@/lib/rules/confidence";
import { toRunView } from "@/lib/sources";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

// Claim Table, claim conflicts, prompt-derived uncertainties and the latest
// extraction run (RLS: the caller's fund only).
export async function loadClaimTable(supabase: Supabase, evaluationId: string, configId: string): Promise<ClaimTableView> {
  const [claims, conflicts, uncertainties, prompts, runs] = await Promise.all([
    supabase
      .from("claims")
      .select(
        "id, code, statement, type, confidence, confidence_basis, links:claim_sources(id, source_id, excerpt, excerpt_start, excerpt_end, marked_wrong_at, source:sources(code, title, tier, party)), coverage:claim_prompt_coverage(prompt_id), arguments:counter_argument_claims(argument:counter_arguments(rank)), falsifiers:falsifier_claims(falsifier:falsifiers(code))",
      )
      .eq("evaluation_id", evaluationId),
    supabase
      .from("conflicts")
      .select("id, code, kind, side_a_id, side_b_id, description, status, parent_conflict_id")
      .eq("evaluation_id", evaluationId),
    supabase
      .from("uncertainties")
      .select("id, code, question, why_unresolved, decision_critical, from_prompt_id, min_evidence_to_resolve, status")
      .eq("evaluation_id", evaluationId),
    supabase.from("collection_prompts").select("id, question").eq("config_id", configId).order("position"),
    supabase
      .from("pipeline_runs")
      .select("id, status, progress, error, warnings, notes")
      .eq("evaluation_id", evaluationId)
      .eq("step", 3)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const r of [claims, conflicts, uncertainties, prompts, runs]) if (r.error) throw r.error;

  const claimCode = new Map(claims.data!.map((c) => [c.id, c.code]));
  const conflictCode = new Map(conflicts.data!.map((c) => [c.id, c.code]));
  const claimConflicts = conflicts.data!.filter((c) => c.kind === "claim");
  const position = new Map(prompts.data!.map((p, i) => [p.id, i + 1]));

  return {
    claims: [...claims.data!]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map((c) => ({
        id: c.id,
        code: c.code,
        statement: c.statement,
        type: c.type,
        confidence: c.confidence,
        basis: c.confidence_basis as ConfidenceBasis | null,
        links: [...c.links]
          .sort((a, b) => codeNumber(a.source.code) - codeNumber(b.source.code))
          .map((l) => ({
            id: l.id,
            sourceId: l.source_id,
            sourceCode: l.source.code,
            sourceTitle: l.source.title,
            tier: l.source.tier,
            party: l.source.party,
            excerpt: l.excerpt,
            start: l.excerpt_start,
            end: l.excerpt_end,
            markedWrong: l.marked_wrong_at !== null,
          })),
        promptIds: c.coverage.map((p) => p.prompt_id),
        citedBy: [
          ...c.arguments.map((a) => a.argument.rank).sort().map((r) => `Counter-argument ${r}`),
          ...c.falsifiers.map((f) => f.falsifier.code).sort((a, b) => codeNumber(a) - codeNumber(b)),
        ],
        conflicts: claimConflicts
          .filter((x) => x.side_a_id === c.id || x.side_b_id === c.id)
          .map((x) => ({
            id: x.id,
            code: x.code,
            status: x.status,
            description: x.description,
            otherCode: claimCode.get(x.side_a_id === c.id ? x.side_b_id : x.side_a_id) ?? "?",
            parentCode: x.parent_conflict_id ? (conflictCode.get(x.parent_conflict_id) ?? null) : null,
          })),
      })),
    uncertainties: [...uncertainties.data!]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map((u) => ({
        id: u.id,
        code: u.code,
        question: u.question,
        whyUnresolved: u.why_unresolved,
        decisionCritical: u.decision_critical,
        fromPrompt: u.from_prompt_id ? (position.get(u.from_prompt_id) ?? null) : null,
        minEvidence: u.min_evidence_to_resolve,
        status: u.status,
      })),
    prompts: prompts.data!,
    run: runs.data![0] ? toRunView(runs.data![0]) : null,
  };
}
