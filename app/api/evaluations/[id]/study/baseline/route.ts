import { adminContext, dbErrorResponse, jsonError } from "@/lib/api";
import { BASELINE_RUN, inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

// Study 2: queue a baseline memo (B1) over this deal's Source Table texts
// (decision 27). Fund admins only; the corpus must exist.
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/study/baseline">) {
  const member = await adminContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, study_parent_id")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.study_parent_id) return jsonError(409, "Run the baseline on the original deal.");
  const { count } = await member.supabase.from("sources").select("id", { count: "exact", head: true }).eq("evaluation_id", id);
  if (!count) return jsonError(409, "The baseline reads the Source Table; build it first.");

  const admin = createAdminClient();
  const { data: memo, error } = await admin
    .from("baseline_memos")
    .insert({ evaluation_id: id, fund_id: evaluation.fund_id, run_number: 0, created_by: member.user.id })
    .select("id, run_number")
    .single();
  if (error) return dbErrorResponse(error);

  try {
    await inngest.send({ name: BASELINE_RUN, data: { evaluationId: id, baselineId: memo.id } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await admin.from("baseline_memos").update({ status: "failed", error: `Couldn't start the background job: ${detail}` }).eq("id", memo.id);
    return jsonError(503, "The background job service isn't reachable. Locally, start the Inngest dev server.");
  }
  return Response.json({ id: memo.id, run: memo.run_number }, { status: 202 });
}
