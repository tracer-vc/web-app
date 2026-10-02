import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { COUNTER_CASE_RUN, inngest } from "@/lib/inngest/client";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 4 "Stress-test thesis": queue P8 → P9 → P10 for the background worker
// (decision 8: route enqueues and returns 202). The deal moves to step 4 here;
// a failed run can be retried until a counter-case exists.
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/counter-case">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.status !== "extracting" && evaluation.status !== "stress_testing") {
    return jsonError(409, "The thesis is stress-tested after claim extraction.");
  }

  const [{ count: claims }, { count: done }, { data: lastClaimRun }] = await Promise.all([
    member.supabase.from("claims").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase.from("counter_arguments").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase
      .from("pipeline_runs")
      .select("status")
      .eq("evaluation_id", id)
      .eq("step", 3)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (done) return jsonError(409, "This deal already has a counter-case.");
  if (!claims || lastClaimRun?.status === "queued" || lastClaimRun?.status === "running") {
    return jsonError(409, "Extract claims first.");
  }

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from("pipeline_runs")
    .insert({ evaluation_id: id, fund_id: evaluation.fund_id, step: 4, status: "queued", created_by: member.user.id })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505" ? jsonError(409, "A run is already in progress for this deal.") : dbErrorResponse(error);
  }

  if (evaluation.status === "extracting") {
    const { error: moveError } = await admin
      .from("evaluations")
      .update({ status: "stress_testing", current_step: 4 })
      .eq("id", id)
      .eq("status", "extracting");
    if (moveError) {
      await failRun(admin, run.id, `Couldn't move the deal to the counter-case: ${moveError.message}`);
      return dbErrorResponse(moveError);
    }
  }

  try {
    await inngest.send({ name: COUNTER_CASE_RUN, data: { evaluationId: id, runId: run.id } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await failRun(admin, run.id, `Couldn't start the background job: ${detail}`);
    return jsonError(503, "The background job service isn't reachable. Locally, start the Inngest dev server.");
  }

  return Response.json({ runId: run.id }, { status: 202 });
}
