import { adminContext, jsonError } from "@/lib/api";
import { buildStudyExport, type StudyFormat } from "@/lib/study";

export const runtime = "nodejs";

const FORMATS: StudyFormat[] = ["pdf", "html", "md"];

// Study 2 export for reviewers (decision 44): every artifact run and baseline
// memo of the deal as its own file (PDF + xlsx, HTML + xlsx, or Markdown),
// zipped with a README. Fund admins only.
export async function GET(request: Request, ctx: RouteContext<"/api/evaluations/[id]/study/export">) {
  const member = await adminContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;
  const format = new URL(request.url).searchParams.get("format") as StudyFormat | null;
  if (!format || !FORMATS.includes(format)) return jsonError(400, "Choose a format: pdf, html or md.");

  const { data: ev } = await member.supabase
    .from("evaluations")
    .select("id, study_parent_id, company:companies(name)")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return jsonError(404, "Deal not found.");
  if (ev.study_parent_id) return jsonError(409, "Export from the original deal.");

  const zip = await buildStudyExport(member.supabase, id, format);
  const name = `${ev.company.name.replace(/[^\w.-]+/g, "_")}_Study2_${format}.zip`;
  return new Response(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
