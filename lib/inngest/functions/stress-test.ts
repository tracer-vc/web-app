import "server-only";

import { callLlm } from "@/lib/llm/call";
import type { PromptClaim } from "@/lib/llm/prompts/claim-table";
import { P10 } from "@/lib/llm/prompts/p10-falsifiers";
import { P8 } from "@/lib/llm/prompts/p8-counter-case";
import { P9 } from "@/lib/llm/prompts/p9-uncertainties";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { COUNTER_CASE_RUN, inngest, type CounterCaseRunData } from "../client";
import { describe, isFatal } from "../errors";

// Decision 17: P9 fills the Uncertainty List up to this many items.
const MAX_UNCERTAINTIES = 10;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

// Step 4 (M11): P8 counter-case → P9 Uncertainty List → P10 falsifiers, then
// one transaction (record_counter_case). Every cited C#/U# is checked against
// this evaluation by the prompts' validation (retries, decision 25) and again
// by the database. P8 and P10 are required; a failed P9 only adds nothing.
export const stressTest = inngest.createFunction(
  {
    id: "stress-test",
    triggers: [{ event: COUNTER_CASE_RUN }],
    concurrency: { limit: 1, key: "event.data.evaluationId" },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: CounterCaseRunData } }).event.data;
      await failRun(createAdminClient(), data.runId, `Counter-case run failed: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const { evaluationId, runId } = event.data as CounterCaseRunData;
    const ids = { runId, evaluationId };
    const setProgress = (p: number) =>
      createAdminClient().from("pipeline_runs").update({ progress: Math.min(99, Math.round(p)) }).eq("id", runId);

    const d = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin.from("pipeline_runs").update({ status: "running", started_at: new Date().toISOString(), progress: 0 }).eq("id", runId);
      const { data: ev, error } = await admin
        .from("evaluations")
        .select("fund_id, config_id, company:companies(name), fund:funds(llm_model), memo:quick_screen_memos(preliminary_thesis)")
        .eq("id", evaluationId)
        .single();
      if (error) throw error;
      const [counterPrompts, prompts, claims, conflicts, uncertainties] = await Promise.all([
        admin.from("counter_case_prompts").select("id, prompt").eq("config_id", ev.config_id).order("position"),
        admin.from("collection_prompts").select("question").eq("config_id", ev.config_id).order("position"),
        admin
          .from("claims")
          .select("id, code, type, confidence, statement, links:claim_sources(marked_wrong_at, source:sources(code))")
          .eq("evaluation_id", evaluationId),
        admin.from("conflicts").select("code, kind, side_a_id, side_b_id, description, status").eq("evaluation_id", evaluationId),
        admin.from("uncertainties").select("code, question, decision_critical").eq("evaluation_id", evaluationId),
      ]);
      for (const r of [counterPrompts, prompts, claims, conflicts, uncertainties]) if (r.error) throw r.error;
      const open = conflicts.data!.filter((c) => c.status === "open");
      return {
        fundId: ev.fund_id,
        model: ev.fund.llm_model,
        company: ev.company.name,
        thesis: ev.memo?.preliminary_thesis ?? "",
        counterPrompts: counterPrompts.data!.map((p, i) => ({ id: p.id, ref: `K${i + 1}`, prompt: p.prompt })),
        prompts: prompts.data!.map((p, i) => ({ ref: `P${i + 1}`, question: p.question })),
        claims: [...claims.data!]
          .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
          .map(
            (c): PromptClaim => ({
              code: c.code,
              type: c.type,
              confidence: c.confidence,
              statement: c.statement,
              sources: [...new Set(c.links.filter((l) => !l.marked_wrong_at).map((l) => l.source.code))].sort(
                (a, b) => codeNumber(a) - codeNumber(b),
              ),
              openConflicts: open
                .filter((x) => x.kind === "claim" && (x.side_a_id === c.id || x.side_b_id === c.id))
                .map((x) => x.code),
            }),
          ),
        openConflicts: open.map((c) => ({ code: c.code, description: c.description })),
        uncertainties: [...uncertainties.data!]
          .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
          .map((u) => ({ code: u.code, question: u.question, decisionCritical: u.decision_critical })),
      };
    });
    const llm = { fundId: d.fundId, model: d.model, ...ids };
    const warnings: string[] = [];

    // 1. P8: three ranked arguments (required)
    const p8 = await step.run("counter-case arguments", async () => {
      const { output } = await callLlm(
        P8,
        { company: d.company, thesis: d.thesis, prompts: d.counterPrompts.map(({ ref, prompt }) => ({ ref, prompt })), claims: d.claims },
        llm,
      );
      await setProgress(35);
      const promptId = new Map(d.counterPrompts.map((p) => [p.ref, p.id]));
      return output.arguments.map((a, i) => ({
        rank: i + 1,
        prompt_id: a.prompt_ref ? (promptId.get(a.prompt_ref) ?? null) : null,
        argument: a.argument.trim(),
        mechanism: a.mechanism.trim(),
        claim_codes: [...new Set(a.claim_ids)],
      }));
    });

    // 2. P9: new uncertainties up to 10 in total (optional; no padding)
    const maxNew = Math.max(0, MAX_UNCERTAINTIES - d.uncertainties.length);
    const p9 = await step.run("uncertainty list", async () => {
      if (maxNew === 0) {
        return { items: [], note: `The Uncertainty List already has ${d.uncertainties.length} items; P9 added none.`, warning: null };
      }
      try {
        const { output } = await callLlm(
          P9,
          {
            company: d.company,
            claims: d.claims,
            prompts: d.prompts,
            openConflicts: d.openConflicts,
            recorded: d.uncertainties.map(({ code, question }) => ({ code, question })),
            counterArguments: p8.map(({ rank, argument }) => ({ rank, argument })),
            maxNew,
          },
          llm,
        );
        await setProgress(65);
        return {
          items: output.uncertainties.map((u) => ({
            question: u.question.trim(),
            why_unresolved: u.why_unresolved.trim(),
            decision_critical: u.decision_critical,
            min_evidence_to_resolve: u.min_evidence.trim(),
          })),
          note: null as string | null,
          warning: null as string | null,
        };
      } catch (e) {
        if (isFatal(e)) throw e;
        return { items: [], note: null, warning: `The Uncertainty List could not be extended (${describe(e)}); only the recorded items remain.` };
      }
    });
    if (p9.warning) warnings.push(p9.warning);
    // New U# continue after the recorded ones (assigned in this order by the database).
    const next = d.uncertainties.length;
    const allUncertainties = [
      ...d.uncertainties,
      ...p9.items.map((u, i) => ({ code: `U${next + i + 1}`, question: u.question, decisionCritical: u.decision_critical })),
    ];

    // 3. P10: 2–4 falsifiers (required)
    const p10 = await step.run("falsifiers", async () => {
      const { output } = await callLlm(
        P10,
        {
          company: d.company,
          thesis: d.thesis,
          counterArguments: p8.map((a) => ({ rank: a.rank, argument: a.argument, claimIds: a.claim_codes })),
          uncertainties: allUncertainties,
          claims: d.claims,
        },
        llm,
      );
      await setProgress(90);
      return output.falsifiers.map((f) => ({
        criterion: f.criterion.trim(),
        outcome_check: f.outcome_check.trim(),
        claim_codes: [...new Set(f.claim_ids)],
        uncertainty_codes: [...new Set(f.uncertainty_ids)],
      }));
    });

    return step.run("record counter-case", async () => {
      const notes = [
        `3 counter-case arguments; ${p9.items.length} uncertainties added (${allUncertainties.length} in total); ${p10.length} falsifiers.`,
        ...(p9.note ? [p9.note] : []),
      ];
      const { error } = await createAdminClient().rpc("record_counter_case", {
        p_evaluation_id: evaluationId,
        p_run_id: runId,
        p_arguments: p8,
        p_uncertainties: p9.items,
        p_falsifiers: p10,
        p_warnings: warnings,
        p_notes: notes,
      });
      if (error) throw error;
      return { arguments: p8.length, uncertainties: p9.items.length, falsifiers: p10.length };
    });
  },
);
