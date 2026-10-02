import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";

const Body = z.object({ uploads_only: z.boolean() });

// Decision 28: per-evaluation "uploads only" switch (no web search in 2b).
// Column-granted to members; the database allows changes only before
// Evidence Collection starts.
export async function PATCH(request: Request, ctx: RouteContext<"/api/evaluations/[id]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Send { uploads_only: true | false }.");

  const { data, error } = await member.supabase
    .from("evaluations")
    .update({ uploads_only: parsed.data.uploads_only })
    .eq("id", id)
    .select("uploads_only");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "Deal not found.");

  return Response.json({ uploadsOnly: data[0].uploads_only });
}
