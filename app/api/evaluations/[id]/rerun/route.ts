import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  step: z.number().int().min(2).max(6),
  confirmFullReset: z.boolean().optional(),
});

// "Re-run step" (decision 20): clear the step and every later step, then the
// step's own button (or the caller) starts it again. Once outputs exist their
// IDs are frozen; a re-run then needs confirmFullReset. Fund membership is
// checked through RLS; the reset itself runs as the pipeline (service role).
export async function POST(request: Request, ctx: RouteContext<"/api/evaluations/[id]/rerun">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Send the step to re-run (2–6).");

  const { data: evaluation } = await member.supabase.from("evaluations").select("id").eq("id", id).maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");

  const { data, error } = await createAdminClient().rpc("reset_from_step", {
    p_evaluation_id: id,
    p_step: parsed.data.step,
    p_confirm_full_reset: parsed.data.confirmFullReset ?? false,
    p_actor_id: member.user.id,
  });
  if (error) return error.code === "23514" ? jsonError(409, error.message) : dbErrorResponse(error);
  return Response.json({ cleared: data });
}
