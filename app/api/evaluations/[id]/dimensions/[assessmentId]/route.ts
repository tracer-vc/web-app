import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";

const Body = z.object({
  override_score: z.number().int().min(0).max(5).nullable(),
  reason: z.string().trim().max(1000).optional(),
});

// "Override score" (decision 14): the model's score and any cap stay as they
// are; the override is stored beside them. The database stamps who and when
// and logs every change. null clears the override.
export async function PATCH(request: Request, ctx: RouteContext<"/api/evaluations/[id]/dimensions/[assessmentId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, assessmentId } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Send an override score from 0 to 5, or null to clear it.");
  const { override_score, reason } = parsed.data;

  const { data, error } = await member.supabase
    .from("dimension_assessments")
    .update({ override_score, override_reason: override_score === null ? null : reason || null })
    .eq("id", assessmentId)
    .eq("evaluation_id", id)
    .select("id, code, score, override_score, override_reason, override_at");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "Assessment not found.");
  return Response.json(data[0]);
}
