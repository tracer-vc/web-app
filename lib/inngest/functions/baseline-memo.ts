import "server-only";

import type { ClassificationCriteria, ScoreAnchors } from "@/lib/config-shared";
import { B1 } from "@/lib/llm/prompts/b1-baseline-memo";
import { fitDocuments } from "@/lib/llm/prompts/p1a-quick-screen-answers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { BASELINE_RUN, inngest, type BaselineRunData } from "../client";
import { callLlmStep } from "../errors";

// Characters of the corpus shown to B1 in total (texts are shortened evenly).
const CORPUS_BUDGET = 200_000;

const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));

// Study 2 baseline (decision 27): one B1 call over the deal's Source Table
// texts with the fund config, stored with its llm_calls row.
export const baselineMemo = inngest.createFunction(
  {
    id: "baseline-memo",
    triggers: [{ event: BASELINE_RUN }],
    retries: 1,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: BaselineRunData } }).event.data;
      await createAdminClient()
        .from("baseline_memos")
        .update({ status: "failed", error: error.message, finished_at: new Date().toISOString() })
        .eq("id", data.baselineId);
    },
  },
  async ({ event, step }) => {
    const { evaluationId, baselineId } = event.data as BaselineRunData;

    const input = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin.from("baseline_memos").update({ status: "running" }).eq("id", baselineId);
      const { data: ev, error } = await admin
        .from("evaluations")
        .select(
          "fund_id, config_id, company:companies(name, stage, sector), fund:funds(llm_model), config:framework_configs(score_anchors, classification_criteria), memo:quick_screen_memos(preliminary_thesis, verdict, uncertainties)",
        )
        .eq("id", evaluationId)
        .single();
      if (error) throw error;
      const [dims, sources] = await Promise.all([
        admin.from("dimensions").select("title, question, prompts:dimension_prompts(position, prompt)").eq("config_id", ev.config_id).order("position"),
        admin.from("sources").select("code, title, origin, url, content_text, document:documents(filename)").eq("evaluation_id", evaluationId),
      ]);
      if (dims.error) throw dims.error;
      if (sources.error) throw sources.error;
      const ordered = [...sources.data].sort((a, b) => codeNumber(a.code) - codeNumber(b.code));
      const fitted = fitDocuments(ordered.map((s) => ({ text: s.content_text })), CORPUS_BUDGET);
      const criteria = ev.config.classification_criteria as ClassificationCriteria;
      return {
        fundId: ev.fund_id,
        model: ev.fund.llm_model,
        refs: ordered.map((s, i) => ({
          n: i + 1,
          source_code: s.code,
          title: s.title,
          origin: s.origin === "upload" ? `upload: ${s.document?.filename ?? ""}` : `web: ${s.url}`,
          url: s.url,
        })),
        b1: {
          company: ev.company,
          quickScreen: {
            thesis: ev.memo?.preliminary_thesis ?? "",
            verdict: ev.memo?.verdict ?? "proceed",
            uncertainties: ev.memo?.uncertainties ?? [],
          },
          dimensions: dims.data.map((d) => ({
            title: d.title,
            question: d.question,
            prompts: [...d.prompts].sort((a, b) => a.position - b.position).map((p) => p.prompt),
          })),
          anchors: ev.config.score_anchors as ScoreAnchors,
          outcomes: (["proceed", "watch", "pass"] as const).map((o) => ({
            outcome: o,
            note: criteria.rules.find((r) => r.outcome === o)?.note ?? "",
          })),
          corpus: ordered.map((s, i) => ({
            n: i + 1,
            title: s.title,
            origin: s.origin === "upload" ? `upload: ${s.document?.filename ?? ""}` : `web: ${s.url}`,
            text: fitted[i].shown,
            truncated: fitted[i].truncated,
          })),
        },
      };
    });

    return step.run("write baseline memo", async () => {
      const { output, llmCallId } = await callLlmStep(B1, input.b1, {
        fundId: input.fundId,
        model: input.model,
        runId: null,
        evaluationId,
      });
      const { error } = await createAdminClient()
        .from("baseline_memos")
        .update({
          status: "done",
          content: output as unknown as Json,
          refs: input.refs as unknown as Json,
          recommendation: output.recommendation,
          model: input.model,
          prompt_key: B1.key,
          prompt_version: B1.version,
          llm_call_id: llmCallId,
          finished_at: new Date().toISOString(),
        })
        .eq("id", baselineId);
      if (error) throw error;
      return { recommendation: output.recommendation };
    });
  },
);
