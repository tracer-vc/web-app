import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { describeIssuePath } from "@/lib/config";

const Body = z.object({
  name: z.string().trim().min(1, { error: "can't be empty" }).max(200),
  stage: z.string().trim().max(60).default(""),
  sector: z.string().trim().max(200).default(""),
  website: z.string().trim().max(500).default(""),
});

// Step 1: create (or reuse) the company and open an evaluation pinned to the
// fund's active config, status screening.
export async function POST(request: Request) {
  const ctx = await memberContext();
  if (ctx instanceof Response) return ctx;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return jsonError(400, `${describeIssuePath(issue.path)}: ${issue.message}`);
  }

  const { name, stage, sector, website } = parsed.data;
  const { data: id, error } = await ctx.supabase.rpc("create_evaluation", {
    p_name: name,
    p_stage: stage,
    p_sector: sector,
    p_website: website,
  });
  if (error) return dbErrorResponse(error);

  return Response.json({ id }, { status: 201 });
}
