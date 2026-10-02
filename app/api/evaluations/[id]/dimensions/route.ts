import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { DIMENSIONS_SCORE, inngest } from "@/lib/inngest/client";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 5 "Score dimensions": queue P11 per dimension for the background worker
// (decision 8: route enqueues and returns 202). The deal moves to step 5 here;
// a failed run can be retried until scores exist.
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/dimensions">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.status !== "stress_testing" && evaluation.status !== "scoring") {
    return jsonError(409, "Dimensions are scored after the counter-case.");
  }

  const [{ count: counterCase }, { count: done }, { data: lastRun }] = await Promise.all([
    member.supabase.from("counter_arguments").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase.from("dimension_assessments").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase
      .from("pipeline_runs")
      .select("status")
      .eq("evaluation_id", id)
      .eq("step", 4)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (done) return jsonError(409, "This deal already has dimension scores.");
  if (!counterCase || lastRun?.status === "queued" || lastRun?.status === "running") {
    return jsonError(409, "Stress-test the thesis first.");
  }

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from("pipeline_runs")
    .insert({ evaluation_id: id, fund_id: evaluation.fund_id, step: 5, status: "queued", created_by: member.user.id })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505" ? jsonError(409, "A run is already in progress for this deal.") : dbErrorResponse(error);
  }

  if (evaluation.status === "stress_testing") {
    const { error: moveError } = await admin
      .from("evaluations")
      .update({ status: "scoring", current_step: 5 })
      .eq("id", id)
      .eq("status", "stress_testing");
    if (moveError) {
      await failRun(admin, run.id, `Couldn't move the deal to dimension scoring: ${moveError.message}`);
      return dbErrorResponse(moveError);
    }
  }

  try {
    await inngest.send({ name: DIMENSIONS_SCORE, data: { evaluationId: id, runId: run.id } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await failRun(admin, run.id, `Couldn't start the background job: ${detail}`);
    return jsonError(503, "The background job service isn't reachable. Locally, start the Inngest dev server.");
  }

  return Response.json({ runId: run.id }, { status: 202 });
}
