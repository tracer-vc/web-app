import "server-only";

import type { ScoreAnchors, SufficiencyRule } from "@/lib/config-shared";
import { anchorKey, type DimensionsView } from "@/lib/dimension-shared";
import { toRunView } from "@/lib/sources";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

// Step 5 outputs: the Dimension Assessment Table with citations, caps and
// overrides (RLS: the caller's fund only).
export async function loadDimensions(supabase: Supabase, evaluationId: string, configId: string): Promise<DimensionsView> {
  const [assessments, config, dims, runs] = await Promise.all([
    supabase
      .from("dimension_assessments")
      .select(
        "id, code, answers, counter_signal, proposed_score, score, override_score, override_reason, override_at, dimension:dimensions(title, question, disqualifying_below), capped:uncertainties(code), overrider:profiles(display_name), claims:dimension_assessment_claims(claim:claims(code))",
      )
      .eq("evaluation_id", evaluationId),
    supabase.from("framework_configs").select("sufficiency_rule, score_anchors").eq("id", configId).single(),
    supabase.from("dimensions").select("id", { count: "exact", head: true }).eq("config_id", configId),
    supabase
      .from("pipeline_runs")
      .select("id, status, progress, error, warnings, notes")
      .eq("evaluation_id", evaluationId)
      .eq("step", 5)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const r of [assessments, config, dims, runs]) if (r.error) throw r.error;

  const anchors = config.data!.score_anchors as ScoreAnchors;
  const rule = config.data!.sufficiency_rule as SufficiencyRule;
  return {
    assessments: [...assessments.data!]
      .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
      .map((a) => ({
        id: a.id,
        code: a.code,
        title: a.dimension.title,
        question: a.dimension.question,
        disqualifyingBelow: a.dimension.disqualifying_below,
        answers: (a.answers as { prompt: string; answer: string; claim_codes: string[] }[]).map((x) => ({
          prompt: x.prompt,
          answer: x.answer,
          claimCodes: x.claim_codes,
        })),
        counterSignal: a.counter_signal,
        proposedScore: a.proposed_score,
        score: a.score,
        cappedBy: a.capped?.code ?? null,
        anchor: anchors[anchorKey(a.override_score ?? a.score)],
        claimCodes: a.claims.map((c) => c.claim.code).sort((x, y) => codeNumber(x) - codeNumber(y)),
        override:
          a.override_score === null
            ? null
            : { score: a.override_score, reason: a.override_reason, by: a.overrider?.display_name ?? null, at: a.override_at },
      })),
    dimensionCount: dims.count ?? 0,
    range: rule.claims_per_score,
    scoreCap: rule.score_cap,
    run: runs.data![0] ? toRunView(runs.data![0]) : null,
  };
}
