import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { inngest, SOURCES_COLLECT } from "@/lib/inngest/client";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";

// Step 2b: queue a Source Table run and hand it to the background worker
// (decision 8: route enqueues and returns 202).
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/sources/collect">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.status !== "collecting") {
    return jsonError(409, "The Source Table is built after a Proceed in the Quick Screen.");
  }

  const [{ count: sources }, { count: readable }] = await Promise.all([
    member.supabase.from("sources").select("id", { count: "exact", head: true }).eq("evaluation_id", id),
    member.supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("evaluation_id", id)
      .eq("extraction_status", "extracted"),
  ]);
  if (sources) return jsonError(409, "This deal already has a Source Table.");
  if (!readable) return jsonError(400, "Upload at least one document with readable text first.");

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from("pipeline_runs")
    .insert({ evaluation_id: id, fund_id: evaluation.fund_id, step: 2, status: "queued", created_by: member.user.id })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505" ? jsonError(409, "A Source Table run is already in progress.") : dbErrorResponse(error);
  }

  try {
    await inngest.send({ name: SOURCES_COLLECT, data: { evaluationId: id, runId: run.id } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await failRun(admin, run.id, `Couldn't start the background job: ${detail}`);
    return jsonError(503, "The background job service isn't reachable. Locally, start the Inngest dev server.");
  }

  return Response.json({ runId: run.id }, { status: 202 });
}
