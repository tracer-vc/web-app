import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { CLAIMS_EXTRACT, inngest } from "@/lib/inngest/client";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 3: queue claim extraction over the Source Table and hand it to the
// background worker (decision 8: route enqueues and returns 202). The deal
// moves to step 3 here; a failed run can be retried until a Claim Table exists.
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/claims/extract">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.status !== "collecting" && evaluation.status !== "extracting") {
    return jsonError(409, "Claims are extracted after the Source Table is built.");
  }

  const [{ count: sources }, { count: claims }, { data: lastSourceRun }] = await Promise.all([
    member.supabase.from("sources").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase.from("claims").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase
      .from("pipeline_runs")
      .select("status")
      .eq("evaluation_id", id)
      .eq("step", 2)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (claims) return jsonError(409, "This deal already has a Claim Table.");
  if (!sources || lastSourceRun?.status === "queued" || lastSourceRun?.status === "running") {
    return jsonError(409, "Build the Source Table first.");
  }

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from("pipeline_runs")
    .insert({ evaluation_id: id, fund_id: evaluation.fund_id, step: 3, status: "queued", created_by: member.user.id })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505" ? jsonError(409, "A run is already in progress for this deal.") : dbErrorResponse(error);
  }

  if (evaluation.status === "collecting") {
    const { error: moveError } = await admin
      .from("evaluations")
      .update({ status: "extracting", current_step: 3 })
      .eq("id", id)
      .eq("status", "collecting");
    if (moveError) {
      await failRun(admin, run.id, `Couldn't move the deal to claim extraction: ${moveError.message}`);
      return dbErrorResponse(moveError);
    }
  }

  try {
    await inngest.send({ name: CLAIMS_EXTRACT, data: { evaluationId: id, runId: run.id } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await failRun(admin, run.id, `Couldn't start the background job: ${detail}`);
    return jsonError(503, "The background job service isn't reachable. Locally, start the Inngest dev server.");
  }

  return Response.json({ runId: run.id }, { status: 202 });
}
