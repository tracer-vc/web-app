import { adminContext, dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { DraftSchema, loadConfig } from "@/lib/config";

// Active config with all child lists; admins also get the open draft, if any.
export async function GET() {
  const ctx = await memberContext();
  if (ctx instanceof Response) return ctx;

  const active = await loadConfig(ctx.supabase, { active: true });
  const draft = ctx.user.role === "admin" ? await loadConfig(ctx.supabase, { draft: true }) : null;
  return Response.json({ active, draft });
}

// Save the editor's state into the draft. Publishing is a separate step
// (POST /api/settings/config/publish), so a published version is never edited.
export async function PUT(request: Request) {
  const ctx = await adminContext();
  if (ctx instanceof Response) return ctx;

  const body = await request.json().catch(() => null);
  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return jsonError(400, `${issue.path.join(".") || "body"}: ${issue.message}`, {
      issues: parsed.error.issues,
    });
  }

  const { error } = await ctx.supabase.rpc("save_config_draft", { p_config: parsed.data });
  if (error) return dbErrorResponse(error);

  return Response.json({ draft: await loadConfig(ctx.supabase, { draft: true }) });
}
