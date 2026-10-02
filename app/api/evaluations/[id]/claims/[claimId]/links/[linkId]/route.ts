import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";

const Body = z.object({ wrong: z.boolean() });

// "Mark link as wrong" (decision 14): the evidence link stays and is shown
// struck through; the database stamps and logs the marking and recomputes the
// claim's confidence without it. Unmarking reverses it (also logged).
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/evaluations/[id]/claims/[claimId]/links/[linkId]">,
) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, claimId, linkId } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Send { wrong: true | false }.");

  // The claim must belong to this deal (RLS limits it to the caller's fund).
  const { data: claim } = await member.supabase
    .from("claims")
    .select("id")
    .eq("id", claimId)
    .eq("evaluation_id", id)
    .maybeSingle();
  if (!claim) return jsonError(404, "Claim not found.");

  const { data, error } = await member.supabase
    .from("claim_sources")
    .update({ marked_wrong_at: parsed.data.wrong ? new Date().toISOString() : null })
    .eq("id", linkId)
    .eq("claim_id", claimId)
    .select("id, marked_wrong_at, claim:claims(confidence, confidence_basis)");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "Evidence link not found.");

  return Response.json({
    id: data[0].id,
    markedWrong: data[0].marked_wrong_at !== null,
    confidence: data[0].claim.confidence,
    basis: data[0].claim.confidence_basis,
  });
}
