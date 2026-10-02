import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";

const Body = z
  .object({
    tier: z.enum(["primary", "secondary", "tertiary"]).optional(),
    party: z.string().trim().min(1, { error: "party can't be empty" }).max(200).optional(),
  })
  .refine((b) => b.tier !== undefined || b.party !== undefined, { error: "send tier and/or party" });

// One source with its full text and the prompts it informs (trace drawer).
export async function GET(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/sources/[sourceId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, sourceId } = await ctx.params;

  const { data } = await member.supabase
    .from("sources")
    .select("code, title, content_text")
    .eq("id", sourceId)
    .eq("evaluation_id", id)
    .maybeSingle();
  if (!data) return jsonError(404, "Source not found.");
  return Response.json({ code: data.code, title: data.title, text: data.content_text });
}

// Decision 23: analysts may correct a source's tier and party. Column-granted;
// the database logs every change (analyst_actions). Confidence is recomputed
// from these once claims exist (M9).
export async function PATCH(request: Request, ctx: RouteContext<"/api/evaluations/[id]/sources/[sourceId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, sourceId } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message);

  const { data, error } = await member.supabase
    .from("sources")
    .update(parsed.data)
    .eq("id", sourceId)
    .eq("evaluation_id", id)
    .select("tier, party");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "Source not found.");

  return Response.json(data[0]);
}
