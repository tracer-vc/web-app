import "server-only";

import type { CounterCaseView } from "@/lib/counter-case-shared";
import { toRunView } from "@/lib/sources";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));
const byCode = (a: string, b: string) => codeNumber(a) - codeNumber(b);

// Step 4 outputs: counter arguments, the full Uncertainty List and falsifiers,
// with the IDs they cite (RLS: the caller's fund only).
export async function loadCounterCase(supabase: Supabase, evaluationId: string, configId: string): Promise<CounterCaseView> {
  const [args, falsifiers, uncertainties, prompts, runs] = await Promise.all([
    supabase
      .from("counter_arguments")
      .select("id, rank, argument, mechanism, prompt:counter_case_prompts(position, prompt), claims:counter_argument_claims(claim:claims(code))")
      .eq("evaluation_id", evaluationId)
      .order("rank"),
    supabase
      .from("falsifiers")
      .select(
        "id, code, criterion, outcome_check, claims:falsifier_claims(claim:claims(code)), uncertainties:falsifier_uncertainties(uncertainty:uncertainties(code))",
      )
      .eq("evaluation_id", evaluationId),
    supabase
      .from("uncertainties")
      .select("id, code, question, why_unresolved, decision_critical, from_prompt_id, min_evidence_to_resolve, status")
      .eq("evaluation_id", evaluationId),
    supabase.from("collection_prompts").select("id").eq("config_id", configId).order("position"),
    supabase
      .from("pipeline_runs")
      .select("id, status, progress, error, warnings, notes")
      .eq("evaluation_id", evaluationId)
      .eq("step", 4)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const r of [args, falsifiers, uncertainties, prompts, runs]) if (r.error) throw r.error;

  const position = new Map(prompts.data!.map((p, i) => [p.id, i + 1]));
  const fs = [...falsifiers.data!]
    .sort((a, b) => byCode(a.code, b.code))
    .map((f) => ({
      id: f.id,
      code: f.code,
      criterion: f.criterion,
      outcomeCheck: f.outcome_check,
      claimCodes: f.claims.map((c) => c.claim.code).sort(byCode),
      uncertaintyCodes: f.uncertainties.map((u) => u.uncertainty.code).sort(byCode),
    }));

  return {
    arguments: args.data!.map((a) => ({
      id: a.id,
      rank: a.rank,
      prompt: a.prompt ? { position: a.prompt.position, text: a.prompt.prompt } : null,
      argument: a.argument,
      mechanism: a.mechanism,
      claimCodes: a.claims.map((c) => c.claim.code).sort(byCode),
    })),
    uncertainties: [...uncertainties.data!]
      .sort((a, b) => byCode(a.code, b.code))
      .map((u) => {
        const fromPrompt = u.from_prompt_id ? (position.get(u.from_prompt_id) ?? null) : null;
        return {
          id: u.id,
          code: u.code,
          question: u.question,
          whyUnresolved: u.why_unresolved,
          decisionCritical: u.decision_critical,
          fromPrompt,
          minEvidence: u.min_evidence_to_resolve,
          status: u.status,
          origin: fromPrompt ? `from prompt ${fromPrompt}` : "uncertainty analysis",
          falsifierCodes: fs.filter((f) => f.uncertaintyCodes.includes(u.code)).map((f) => f.code),
        };
      }),
    falsifiers: fs,
    run: runs.data![0] ? toRunView(runs.data![0]) : null,
  };
}
