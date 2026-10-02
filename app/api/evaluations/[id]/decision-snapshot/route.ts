import { outputDocument } from "@/lib/output-api";

// Rendered from rows (no LLM): see lib/output-api.ts.
export async function GET(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/decision-snapshot">) {
  const { id } = await ctx.params;
  return outputDocument(id, "decision-snapshot");
}
