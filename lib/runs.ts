import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// pipeline_runs bookkeeping for synchronous steps (service role; the caller
// has already checked fund membership through RLS).
export async function startRun(admin: Admin, opts: { evaluationId: string; fundId: string; step: number; userId: string }) {
  const { data, error } = await admin
    .from("pipeline_runs")
    .insert({
      evaluation_id: opts.evaluationId,
      fund_id: opts.fundId,
      step: opts.step,
      status: "running",
      started_at: new Date().toISOString(),
      created_by: opts.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function failRun(admin: Admin, runId: string, message: string) {
  await admin
    .from("pipeline_runs")
    .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
    .eq("id", runId);
}
