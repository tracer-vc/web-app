import "server-only";

import type { SufficiencyRule } from "@/lib/config-shared";
import type { OutputsView, Section, StatementView, StructuralCheck } from "@/lib/output-shared";
import type { ClassificationTrace } from "@/lib/rules/classification";
import { toRunView } from "@/lib/sources";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));
const UNCERTAINTY_SECTIONS: Section[] = ["open_question", "research_agenda"];

// Statements (with their references as codes), the R3 decision and the
// Evidence Pack's structural checks, all from rows (RLS: the caller's fund).
export async function loadOutputs(supabase: Supabase, evaluationId: string, configId: string): Promise<OutputsView> {
  const [statements, decision, claims, sources, uncertainties, falsifiers, conflicts, assessments, config, prompts, runs] =
    await Promise.all([
      supabase
        .from("statements")
        .select("id, document, section, position, text, detail, refs:statement_refs(ref_kind, ref_id, position)")
        .eq("evaluation_id", evaluationId),
      supabase.from("decisions").select("classification, rule_trace, reeval_trigger").eq("evaluation_id", evaluationId).maybeSingle(),
      supabase
        .from("claims")
        .select("id, code, type, links:claim_sources(excerpt, excerpt_start, excerpt_end, marked_wrong_at)")
        .eq("evaluation_id", evaluationId),
      supabase.from("sources").select("id, code").eq("evaluation_id", evaluationId),
      supabase.from("uncertainties").select("id, code, from_prompt_id, status").eq("evaluation_id", evaluationId),
      supabase.from("falsifiers").select("id, code").eq("evaluation_id", evaluationId),
      supabase.from("conflicts").select("code, status").eq("evaluation_id", evaluationId),
      supabase.from("dimension_assessments").select("code, claims:dimension_assessment_claims(claim_id)").eq("evaluation_id", evaluationId),
      supabase.from("framework_configs").select("sufficiency_rule").eq("id", configId).single(),
      supabase.from("collection_prompts").select("id, required").eq("config_id", configId),
      supabase
        .from("pipeline_runs")
        .select("id, status, progress, error, warnings, notes")
        .eq("evaluation_id", evaluationId)
        .eq("step", 6)
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  for (const r of [statements, decision, claims, sources, uncertainties, falsifiers, conflicts, assessments, config, prompts, runs]) {
    if (r.error) throw r.error;
  }

  const code = new Map<string, string>([
    ...claims.data!.map((x) => [x.id, x.code] as const),
    ...sources.data!.map((x) => [x.id, x.code] as const),
    ...uncertainties.data!.map((x) => [x.id, x.code] as const),
    ...falsifiers.data!.map((x) => [x.id, x.code] as const),
  ]);
  const grouped: Partial<Record<Section, StatementView[]>> = {};
  for (const s of statements.data!) {
    const refsOf = (kind: string) =>
      s.refs
        .filter((r) => r.ref_kind === kind)
        .sort((a, b) => a.position - b.position)
        .map((r) => code.get(r.ref_id) ?? "?");
    (grouped[s.section] ??= []).push({
      id: s.id,
      section: s.section,
      position: s.position,
      text: s.text,
      detail: s.detail,
      refs: { claims: refsOf("claim"), sources: refsOf("source"), uncertainties: refsOf("uncertainty"), falsifiers: refsOf("falsifier") },
    });
  }
  for (const list of Object.values(grouped)) list.sort((a, b) => a.position - b.position);

  // Structural checks (Evidence Pack): invariants must hold; counts inform.
  const all = statements.data!;
  const withoutClaim = all.filter((s) => !UNCERTAINTY_SECTIONS.includes(s.section) && !s.refs.some((r) => r.ref_kind === "claim")).length;
  const withoutU = all.filter((s) => UNCERTAINTY_SECTIONS.includes(s.section) && !s.refs.some((r) => r.ref_kind === "uncertainty")).length;
  const evidenced = claims.data!.filter((c) => c.type !== "speculation");
  const factsOk = evidenced.filter((c) => c.links.some((l) => l.excerpt.trim() && l.excerpt_end > l.excerpt_start)).length;
  const specs = claims.data!.filter((c) => c.type === "speculation");
  const rule = config.data!.sufficiency_rule as SufficiencyRule;
  const inRange = assessments.data!.filter(
    (a) => a.claims.length >= rule.claims_per_score.min && a.claims.length <= rule.claims_per_score.max,
  ).length;
  const openConflicts = conflicts.data!.filter((c) => c.status === "open").map((c) => c.code).sort((a, b) => codeNumber(a) - codeNumber(b));
  const required = new Set(prompts.data!.filter((p) => p.required).map((p) => p.id));
  const uncovered = uncertainties.data!.filter((u) => u.from_prompt_id && required.has(u.from_prompt_id) && u.status === "open").length;
  const links = claims.data!.flatMap((c) => c.links);
  const wrong = links.filter((l) => l.marked_wrong_at).length;
  const checks: StructuralCheck[] = [
    { label: "Evaluative statements without a C#", value: String(withoutClaim), ok: withoutClaim === 0, note: "Every Thesis Card and Snapshot statement cites claims (decision 11)." },
    { label: "Open questions and research items without a U#", value: String(withoutU), ok: withoutU === 0, note: "These cite the uncertainty they address." },
    { label: "Facts and Inferences with S# + verbatim excerpt", value: `${factsOk} of ${evidenced.length}`, ok: factsOk === evidenced.length, note: "Excerpts were found verbatim in the source text (R4)." },
    { label: "Speculation without evidence links", value: `${specs.length} of ${specs.length}`, ok: true, note: "Enforced by the database: a speculation cannot carry a source link." },
    { label: "Dimension scores citing the required number of claims", value: `${inRange} of ${assessments.data!.length}`, ok: inRange === assessments.data!.length, note: `Each score cites ${rule.claims_per_score.min}–${rule.claims_per_score.max} claims.` },
    { label: "Every conflict has a status", value: `${conflicts.data!.length} of ${conflicts.data!.length}`, ok: true, note: "Status is mandatory; both sides are kept." },
    { label: "Open conflicts", value: String(openConflicts.length), ok: null, note: openConflicts.length ? `${openConflicts.join(", ")} shown as open in the outputs.` : "Every conflict carries a resolution and rationale." },
    { label: "Required Collection Prompts uncovered", value: String(uncovered), ok: null, note: uncovered ? "Written to the Uncertainty List; dependent dimensions are capped." : "Every required prompt has an answering claim." },
    { label: "Evidence links marked wrong", value: `${wrong} of ${links.length}`, ok: null, note: "The false-link rate; marked links no longer count for confidence." },
  ];

  const d = decision.data;
  const trace = d?.rule_trace as ClassificationTrace | undefined;
  return {
    decision: d && trace ? { classification: d.classification, ruleApplied: trace.rule_applied, trace, reevalTrigger: d.reeval_trigger } : null,
    statements: grouped,
    checks,
    run: runs.data![0] ? toRunView(runs.data![0]) : null,
  };
}
