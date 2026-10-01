import { adminContext, dbErrorResponse } from "@/lib/api";

// The draft becomes the active published version; the previous one stays
// unchanged (inactive) for evaluations pinned to it.
export async function POST() {
  const ctx = await adminContext();
  if (ctx instanceof Response) return ctx;

  const { data: version, error } = await ctx.supabase.rpc("publish_config");
  if (error) return dbErrorResponse(error);

  return Response.json({ version });
}
