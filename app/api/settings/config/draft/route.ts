import { adminContext, dbErrorResponse } from "@/lib/api";
import { loadConfig } from "@/lib/config";

// Start editing: copy the active version into a draft (or return the open one).
export async function POST() {
  const ctx = await adminContext();
  if (ctx instanceof Response) return ctx;

  const { data: id, error } = await ctx.supabase.rpc("create_config_draft");
  if (error) return dbErrorResponse(error);

  return Response.json({ draft: await loadConfig(ctx.supabase, { id }) }, { status: 201 });
}

// Discard the draft and all its rows.
export async function DELETE() {
  const ctx = await adminContext();
  if (ctx instanceof Response) return ctx;

  const { error } = await ctx.supabase.rpc("discard_config_draft");
  if (error) return dbErrorResponse(error);

  return new Response(null, { status: 204 });
}
