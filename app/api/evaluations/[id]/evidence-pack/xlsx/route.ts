import { jsonError, memberContext } from "@/lib/api";
import { evidencePackSheets } from "@/lib/evidence-pack-sheets";
import { writeXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";

// Evidence Pack export (decision 31): one sheet per table, IDs as in the UI,
// from the same rows the tabs render (RLS as the caller).
export async function GET(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/evidence-pack/xlsx">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: ev } = await member.supabase
    .from("evaluations")
    .select("id, config_id, company:companies(name)")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return jsonError(404, "Deal not found.");

  const buffer = await writeXlsx(await evidencePackSheets(member.supabase, id, ev.config_id));
  const name = `${ev.company.name.replace(/[^\w.-]+/g, "_")}_Evidence_Pack.xlsx`;
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
