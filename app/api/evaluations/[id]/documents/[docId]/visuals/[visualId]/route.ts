import { jsonError, memberContext } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

// The stored image a visual block was read from (decision 45), for the trace
// drawer. Access is checked through RLS on document_visuals and documents.
export async function GET(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/documents/[docId]/visuals/[visualId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, docId, visualId } = await ctx.params;

  const { data } = await member.supabase
    .from("document_visuals")
    .select("storage_path, mime_type, document:documents!inner(evaluation_id)")
    .eq("id", visualId)
    .eq("document_id", docId)
    .eq("document.evaluation_id", id)
    .maybeSingle();
  if (!data?.storage_path) return jsonError(404, "Image not found.");

  const { data: file, error } = await createAdminClient().storage.from("deal-documents").download(data.storage_path);
  if (error || !file) return jsonError(404, "Image not found.");
  return new Response(file, {
    headers: { "Content-Type": data.mime_type ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
