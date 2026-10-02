import "server-only";

import type { ScoreAnchors, SufficiencyRule } from "@/lib/config-shared";
import { callLlm } from "@/lib/llm/call";
import { P11 } from "@/lib/llm/prompts/p11-assess-dimension";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { DIMENSIONS_SCORE, inngest, type DimensionsScoreData } from "../client";
import { loadClaimContext } from "../claim-context";

// Step 5 (M12): P11 once per dimension of the pinned config, in parallel, then
// one transaction (record_dimension_assessments). The claims-per-score range
// is enforced by P11's validation (retries) and again at commit; the database
// applies the score cap (decision 15). Every dimension is required: if one
// assessment fails after its retries, the run fails and can be retried.
export const scoreDimensions = inngest.createFunction(
  {
    id: "score-dimensions",
    triggers: [{ event: DIMENSIONS_SCORE }],
    concurrency: { limit: 1, key: "event.data.evaluationId" },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: DimensionsScoreData } }).event.data;
      await failRun(createAdminClient(), data.runId, `Dimension scoring failed: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const { evaluationId, runId } = event.data as DimensionsScoreData;
    const ids = { runId, evaluationId };

    const d = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin.from("pipeline_runs").update({ status: "running", started_at: new Date().toISOString(), progress: 0 }).eq("id", runId);
      const { data: ev, error } = await admin
        .from("evaluations")
        .select(
          "fund_id, config_id, company:companies(name), fund:funds(llm_model), config:framework_configs(sufficiency_rule, score_anchors)",
        )
        .eq("id", evaluationId)
        .single();
      if (error) throw error;
      const [dims, context] = await Promise.all([
        admin
          .from("dimensions")
          .select(
            "id, position, title, question, claim_coverage, high_score_signals, low_score_signals, disqualifying_below, prompts:dimension_prompts(id, position, prompt)",
          )
          .eq("config_id", ev.config_id)
          .order("position"),
        loadClaimContext(admin, evaluationId),
      ]);
      if (dims.error) throw dims.error;
      const rule = ev.config.sufficiency_rule as SufficiencyRule;
      return {
        fundId: ev.fund_id,
        model: ev.fund.llm_model,
        company: ev.company.name,
        anchors: ev.config.score_anchors as ScoreAnchors,
        range: rule.claims_per_score,
        dimensions: dims.data!.map((x) => ({ ...x, prompts: [...x.prompts].sort((a, b) => a.position - b.position) })),
        ...context,
      };
    });
    const llm = { fundId: d.fundId, model: d.model, ...ids };

    let finished = 0;
    const assessments = await Promise.all(
      d.dimensions.map((dim) =>
        step.run(`assess ${dim.position}: ${dim.title.slice(0, 60)}`, async () => {
          const prompts = dim.prompts.map((p, i) => ({ id: p.id, ref: `Q${i + 1}`, prompt: p.prompt }));
          const { output } = await callLlm(
            P11,
            {
              company: d.company,
              dimension: {
                title: dim.title,
                question: dim.question,
                claimCoverage: dim.claim_coverage,
                highSignals: dim.high_score_signals,
                lowSignals: dim.low_score_signals,
                disqualifyingBelow: dim.disqualifying_below,
              },
              prompts: prompts.map(({ ref, prompt }) => ({ ref, prompt })),
              anchors: d.anchors,
              claims: d.claims,
              openConflicts: d.openConflicts,
              uncertainties: d.uncertainties,
              range: d.range,
            },
            llm,
          );
          finished++;
          await createAdminClient()
            .from("pipeline_runs")
            .update({ progress: Math.min(95, Math.round((finished / d.dimensions.length) * 95)) })
            .eq("id", runId);
          const byRef = new Map(prompts.map((p) => [p.ref, p]));
          return {
            dimension_id: dim.id,
            answers: prompts.map((p) => {
              const a = output.answers.find((x) => x.prompt_ref === p.ref)!;
              return { prompt_id: p.id, prompt: byRef.get(p.ref)!.prompt, answer: a.answer.trim(), claim_codes: [...new Set(a.claim_ids)] };
            }),
            counter_signal: output.counter_signal.trim(),
            proposed_score: output.score,
            claim_codes: [...new Set(output.justification_claim_ids)],
          };
        }),
      ),
    );

    return step.run("record dimension scores", async () => {
      const { error } = await createAdminClient().rpc("record_dimension_assessments", {
        p_evaluation_id: evaluationId,
        p_run_id: runId,
        p_assessments: assessments,
        p_warnings: [],
        p_notes: [`${assessments.length} dimensions assessed; scores cite ${d.range.min}–${d.range.max} claims each.`],
      });
      if (error) throw error;
      return { dimensions: assessments.length };
    });
  },
);
