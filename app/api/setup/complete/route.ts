import { adminContext, dbErrorResponse } from "@/lib/api";

// Finish the guided fund setup: publish the setup draft as v1 and mark the
// fund as set up (decision 47). Skipping the wizard calls this right away.
export async function POST() {
  const ctx = await adminContext();
  if (ctx instanceof Response) return ctx;

  const { data: version, error } = await ctx.supabase.rpc("complete_fund_setup");
  if (error) return dbErrorResponse(error);

  return Response.json({ version });
}
