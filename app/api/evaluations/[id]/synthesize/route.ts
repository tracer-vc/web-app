import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { inngest, SYNTHESIZE } from "@/lib/inngest/client";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 6 "Generate outputs": queue P12 → R3 → P13 for the background worker
// (decision 8: route enqueues and returns 202). The deal moves to step 6 here;
// a failed run can be retried until outputs exist. Open conflicts do not block
// synthesis (decision 21).
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/synthesize">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.status !== "scoring" && evaluation.status !== "synthesizing") {
    return jsonError(409, "Outputs are generated after the dimensions are scored.");
  }

  const [{ count: scored }, { count: done }, { data: lastRun }] = await Promise.all([
    member.supabase.from("dimension_assessments").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase.from("decisions").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase
      .from("pipeline_runs")
      .select("status")
      .eq("evaluation_id", id)
      .eq("step", 5)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (done) return jsonError(409, "This deal already has outputs.");
  if (!scored || lastRun?.status === "queued" || lastRun?.status === "running") {
    return jsonError(409, "Score the dimensions first.");
  }

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from("pipeline_runs")
    .insert({ evaluation_id: id, fund_id: evaluation.fund_id, step: 6, status: "queued", created_by: member.user.id })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505" ? jsonError(409, "A run is already in progress for this deal.") : dbErrorResponse(error);
  }

  if (evaluation.status === "scoring") {
    const { error: moveError } = await admin
      .from("evaluations")
      .update({ status: "synthesizing", current_step: 6 })
      .eq("id", id)
      .eq("status", "scoring");
    if (moveError) {
      await failRun(admin, run.id, `Couldn't move the deal to synthesis: ${moveError.message}`);
      return dbErrorResponse(moveError);
    }
  }

  try {
    await inngest.send({ name: SYNTHESIZE, data: { evaluationId: id, runId: run.id } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await failRun(admin, run.id, `Couldn't start the background job: ${detail}`);
    return jsonError(503, "The background job service isn't reachable. Locally, start the Inngest dev server.");
  }

  return Response.json({ runId: run.id }, { status: 202 });
}
