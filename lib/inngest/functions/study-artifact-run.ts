import "server-only";

import type { Enums } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest, STUDY_ARTIFACT, type StudyArtifactData } from "../client";
import { collectSources } from "./collect-sources";
import { extractClaims } from "./extract-claims";
import { scoreDimensions } from "./score-dimensions";
import { stressTest } from "./stress-test";
import { synthesize } from "./synthesize";

// Study 2 artifact run (decision 44): steps 2b–6 back to back on a study copy,
// each through the same worker an analyst's button starts. A failed step stops
// the run; its error is on that step's run row and the copy can be continued
// from its own deal page.
const STEPS = [
  { step: 2, status: "collecting", fn: collectSources },
  { step: 3, status: "extracting", fn: extractClaims },
  { step: 4, status: "stress_testing", fn: stressTest },
  { step: 5, status: "scoring", fn: scoreDimensions },
  { step: 6, status: "synthesizing", fn: synthesize },
] as const satisfies readonly { step: number; status: Enums<"evaluation_status">; fn: unknown }[];

export const studyArtifactRun = inngest.createFunction(
  { id: "study-artifact-run", triggers: [{ event: STUDY_ARTIFACT }], retries: 0 },
  async ({ event, step }) => {
    const { evaluationId, actorId } = event.data as StudyArtifactData;
    for (const s of STEPS) {
      const runId = await step.run(`begin step ${s.step}`, async () => {
        const admin = createAdminClient();
        const { data: ev, error: moveError } = await admin
          .from("evaluations")
          .update({ status: s.status, current_step: s.step })
          .eq("id", evaluationId)
          .select("fund_id")
          .single();
        if (moveError) throw moveError;
        const { data, error } = await admin
          .from("pipeline_runs")
          .insert({ evaluation_id: evaluationId, fund_id: ev.fund_id, step: s.step, status: "queued", created_by: actorId })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      });
      await step.invoke(`step ${s.step}`, { function: s.fn, data: { evaluationId, runId } });
    }
    return { evaluationId };
  },
);
