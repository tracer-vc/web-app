import "server-only";

import { jsonError, memberContext } from "@/lib/api";
import { loadClaimTable } from "@/lib/claims";
import { loadConflictRegister } from "@/lib/conflicts";
import { loadCounterCase } from "@/lib/counter-case";
import { loadDimensions } from "@/lib/dimensions";
import { loadOutputs } from "@/lib/outputs";
import { loadSourceTable } from "@/lib/sources";

// GET /api/evaluations/[id]/{thesis-card|decision-snapshot|evidence-pack}:
// the rows each document is rendered from (no LLM; RLS as the caller).
export async function outputDocument(id: string, doc: "thesis-card" | "decision-snapshot" | "evidence-pack") {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { supabase } = member;

  const { data: ev } = await supabase
    .from("evaluations")
    .select("id, config_id, company:companies(name, stage, sector)")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return jsonError(404, "Deal not found.");

  const outputs = await loadOutputs(supabase, id, ev.config_id);
  if (!outputs.decision) return jsonError(409, "Outputs have not been generated yet.");
  const pick = (...sections: (keyof typeof outputs.statements)[]) =>
    Object.fromEntries(sections.map((s) => [s, outputs.statements[s] ?? []]));

  if (doc === "thesis-card") {
    const [counterCase, dimensions] = await Promise.all([loadCounterCase(supabase, id, ev.config_id), loadDimensions(supabase, id, ev.config_id)]);
    return Response.json({
      company: ev.company,
      statements: pick("thesis", "outlier", "base_case", "upside_case", "failure_case", "moat", "entry_wedge", "milestone"),
      falsifiers: counterCase.falsifiers,
      dimensions: dimensions.assessments,
      openQuestions: counterCase.uncertainties.filter((u) => u.decisionCritical && u.status === "open"),
    });
  }
  if (doc === "decision-snapshot") {
    const [counterCase, conflicts] = await Promise.all([loadCounterCase(supabase, id, ev.config_id), loadConflictRegister(supabase, id)]);
    return Response.json({
      company: ev.company,
      decision: outputs.decision,
      statements: pick("justification", "supporting_arg", "research_agenda", "reeval_trigger"),
      risks: counterCase.arguments,
      openConflicts: conflicts.filter((c) => c.status === "open"),
    });
  }
  const [sources, claims, conflicts, counterCase, dimensions] = await Promise.all([
    loadSourceTable(supabase, id, ev.config_id),
    loadClaimTable(supabase, id, ev.config_id),
    loadConflictRegister(supabase, id),
    loadCounterCase(supabase, id, ev.config_id),
    loadDimensions(supabase, id, ev.config_id),
  ]);
  return Response.json({
    company: ev.company,
    checks: outputs.checks,
    sources: sources.sources,
    claims: claims.claims,
    conflicts,
    uncertainties: counterCase.uncertainties,
    dimensions: dimensions.assessments,
  });
}
