import { jsonError, memberContext } from "@/lib/api";

// Run status for polling (fallback to Realtime, data_flow.html).
export async function GET(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/runs/[runId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, runId } = await ctx.params;

  const { data } = await member.supabase
    .from("pipeline_runs")
    .select("id, step, status, progress, error, warnings, notes, started_at, finished_at")
    .eq("id", runId)
    .eq("evaluation_id", id)
    .maybeSingle();
  if (!data) return jsonError(404, "Run not found.");

  return Response.json({
    id: data.id,
    step: data.step,
    status: data.status,
    progress: data.progress,
    error: data.error,
    warnings: data.warnings,
    notes: data.notes,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
  });
}
