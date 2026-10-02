import "server-only";

import type { ClassificationCriteria } from "@/lib/config-shared";
import { P12, stripLabel, type P12Output } from "@/lib/llm/prompts/p12-thesis-card";
import { P13 } from "@/lib/llm/prompts/p13-decision-snapshot";
import type { Item, SynthesisContext } from "@/lib/llm/prompts/synthesis-shared";
import { classify } from "@/lib/rules/classification";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { inngest, SYNTHESIZE, type SynthesizeData } from "../client";
import { callLlmStep } from "../errors";
import { loadClaimContext } from "../claim-context";

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

type StatementRow = {
  document: "thesis_card" | "decision_snapshot";
  section: string;
  position: number;
  text: string;
  detail?: string | null;
  claim_codes: string[];
  source_codes: string[];
  uncertainty_codes: string[];
  falsifier_codes: string[];
};

const row = (
  document: StatementRow["document"],
  section: string,
  position: number,
  item: Item,
  detail?: string,
): StatementRow => ({
  document,
  section,
  position,
  text: item.text.trim(),
  detail: detail?.trim() || null,
  claim_codes: [...new Set(item.claim_ids)],
  source_codes: [...new Set(item.source_ids)],
  uncertainty_codes: [...new Set(item.uncertainty_ids)],
  falsifier_codes: [...new Set(item.falsifier_ids)],
});

function thesisCardRows(o: P12Output): StatementRow[] {
  return [
    row("thesis_card", "thesis", 1, o.thesis),
    row("thesis_card", "outlier", 1, o.outlier),
    row("thesis_card", "base_case", 1, o.base_case, stripLabel(o.base_case.detail)),
    row("thesis_card", "upside_case", 1, o.upside_case, stripLabel(o.upside_case.detail)),
    row("thesis_card", "failure_case", 1, o.failure_case, stripLabel(o.failure_case.detail)),
    row("thesis_card", "moat", 1, o.moat),
    row("thesis_card", "entry_wedge", 1, o.entry_wedge),
    ...o.milestones.map((m, i) => row("thesis_card", "milestone", i + 1, m)),
  ];
}

// Step 6 (M13): P12 Thesis Card → R3 classification by rule → P13 Decision
// Snapshot → one transaction (record_synthesis) that completes the deal.
// Statements failing validation are regenerated (decision 25: up to 2
// retries); if they still fail, the run fails and nothing is saved.
export const synthesize = inngest.createFunction(
  {
    id: "synthesize",
    triggers: [{ event: SYNTHESIZE }],
    concurrency: { limit: 1, key: "event.data.evaluationId" },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: SynthesizeData } }).event.data;
      await failRun(createAdminClient(), data.runId, error.message);
    },
  },
  async ({ event, step }) => {
    const { evaluationId, runId } = event.data as SynthesizeData;
    const ids = { runId, evaluationId };
    const setProgress = (p: number) => createAdminClient().from("pipeline_runs").update({ progress: p }).eq("id", runId);

    const d = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin.from("pipeline_runs").update({ status: "running", started_at: new Date().toISOString(), progress: 0 }).eq("id", runId);
      const { data: ev, error } = await admin
        .from("evaluations")
        .select(
          "fund_id, company:companies(name, stage, sector), fund:funds(llm_model), config:framework_configs(classification_criteria), memo:quick_screen_memos(preliminary_thesis)",
        )
        .eq("id", evaluationId)
        .single();
      if (error) throw error;
      const [context, args, us, fs, dims, openConflicts] = await Promise.all([
        loadClaimContext(admin, evaluationId),
        admin
          .from("counter_arguments")
          .select("rank, argument, mechanism, claims:counter_argument_claims(claim:claims(code))")
          .eq("evaluation_id", evaluationId)
          .order("rank"),
        admin
          .from("uncertainties")
          .select("code, question, decision_critical, min_evidence_to_resolve, status")
          .eq("evaluation_id", evaluationId),
        admin.from("falsifiers").select("code, criterion, outcome_check").eq("evaluation_id", evaluationId),
        admin
          .from("dimension_assessments")
          .select("code, score, override_score, counter_signal, dimension:dimensions(title, disqualifying_below), capped:uncertainties(code)")
          .eq("evaluation_id", evaluationId),
        admin.from("conflicts").select("id", { count: "exact", head: true }).eq("evaluation_id", evaluationId).eq("status", "open"),
      ]);
      for (const r of [args, us, fs, dims, openConflicts]) if (r.error) throw r.error;
      const sortedDims = [...dims.data!].sort((a, b) => codeNumber(a.code) - codeNumber(b.code));
      const ctx: SynthesisContext = {
        company: ev.company,
        preliminaryThesis: ev.memo?.preliminary_thesis ?? "",
        claims: context.claims,
        openConflicts: context.openConflicts,
        counterArguments: args.data!.map((a) => ({
          rank: a.rank,
          argument: a.argument,
          mechanism: a.mechanism,
          claimIds: a.claims.map((c) => c.claim.code).sort((x, y) => codeNumber(x) - codeNumber(y)),
        })),
        uncertainties: [...us.data!]
          .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
          .map((u) => ({ code: u.code, question: u.question, decisionCritical: u.decision_critical, minEvidence: u.min_evidence_to_resolve })),
        falsifiers: [...fs.data!]
          .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
          .map((f) => ({ code: f.code, criterion: f.criterion, outcomeCheck: f.outcome_check })),
        dimensions: sortedDims.map((x) => ({
          code: x.code,
          title: x.dimension.title,
          score: x.override_score ?? x.score,
          counterSignal: x.counter_signal,
          cappedBy: x.capped?.code ?? null,
        })),
      };
      return {
        fundId: ev.fund_id,
        model: ev.fund.llm_model,
        criteria: ev.config.classification_criteria as ClassificationCriteria,
        ctx,
        facts: {
          // the score that counts: an analyst override, else the (capped) score
          dimensions: sortedDims.map((x) => ({
            code: x.code,
            title: x.dimension.title,
            score: x.override_score ?? x.score,
            disqualifyingBelow: x.dimension.disqualifying_below,
          })),
          openDecisionCriticalUncertainties: us.data!.filter((u) => u.status === "open" && u.decision_critical).length,
          openConflicts: openConflicts.count ?? 0,
        },
      };
    });
    const llm = { fundId: d.fundId, model: d.model, ...ids };

    // 1. P12 Thesis Card (required)
    const thesisCard = await step.run("thesis card", async () => {
      const { output } = await callLlmStep(P12, d.ctx, llm);
      await setProgress(45);
      return thesisCardRows(output);
    });

    // 2. R3 by rule, then P13 Decision Snapshot (required)
    const decision = classify(d.criteria, d.facts);
    const snapshot = await step.run("decision snapshot", async () => {
      const { output } = await callLlmStep(
        P13,
        {
          ...d.ctx,
          classification: decision.classification,
          ruleApplied: decision.rule_applied,
          thesisCard: thesisCard.map((s) => ({ section: s.section, text: s.detail ? `${s.text} (${s.detail})` : s.text })),
        },
        llm,
      );
      await setProgress(90);
      return {
        rows: [
          row("decision_snapshot", "justification", 1, output.justification),
          ...output.supporting.map((s, i) => row("decision_snapshot", "supporting_arg", i + 1, s)),
          ...output.research_agenda.map((r, i) => row("decision_snapshot", "research_agenda", i + 1, r, r.evidence)),
          row("decision_snapshot", "reeval_trigger", 1, output.reeval_trigger),
        ],
        reevalTrigger: output.reeval_trigger.text.trim(),
      };
    });

    return step.run("record outputs", async () => {
      const statements = [...thesisCard, ...snapshot.rows];
      const { error } = await createAdminClient().rpc("record_synthesis", {
        p_evaluation_id: evaluationId,
        p_run_id: runId,
        p_statements: statements as unknown as Json,
        p_classification: decision.classification,
        p_rule_trace: decision as unknown as Json,
        p_reeval_trigger: snapshot.reevalTrigger,
        p_warnings: [],
        p_notes: [`${statements.length} statements; classification ${decision.rule_applied}`],
      });
      if (error) throw error;
      return { statements: statements.length, classification: decision.classification };
    });
  },
);
