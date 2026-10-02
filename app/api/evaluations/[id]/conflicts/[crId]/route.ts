import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { MAX_RATIONALE_LENGTH } from "@/lib/conflict-shared";

const Body = z
  .object({
    status: z.enum(["open", "resolved_a", "resolved_b", "unresolvable"]),
    rationale: z.string().trim().max(MAX_RATIONALE_LENGTH).optional(),
  })
  .refine((b) => b.status === "open" || !!b.rationale, {
    error: "A resolution needs a rationale.",
  });

// Record a conflict's resolution (Conflict Register). The status is mandatory
// and leaving `open` needs a rationale; the database stamps who and when, logs
// the change and recomputes the confidence of both claims (decision 9).
export async function PATCH(request: Request, ctx: RouteContext<"/api/evaluations/[id]/conflicts/[crId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, crId } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message);
  const { status, rationale } = parsed.data;

  const { data, error } = await member.supabase
    .from("conflicts")
    .update({ status, ...(rationale !== undefined ? { rationale } : {}) })
    .eq("id", crId)
    .eq("evaluation_id", id)
    .select("id, code, status, rationale, resolved_at, resolver:profiles(display_name)");
  if (error) {
    // resolution_is_explained: the database's own guard (e.g. a blank rationale)
    if (error.code === "23514") return jsonError(400, "A resolution needs a rationale.");
    return dbErrorResponse(error);
  }
  if (!data.length) return jsonError(404, "Conflict not found.");

  const c = data[0];
  return Response.json({
    id: c.id,
    code: c.code,
    status: c.status,
    rationale: c.rationale,
    resolvedAt: c.resolved_at,
    resolvedBy: c.resolver?.display_name ?? null,
  });
}
