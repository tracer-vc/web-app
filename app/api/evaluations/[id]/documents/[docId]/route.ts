import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";

// Extracted text of one document (RLS: members of the deal's fund only).
export async function GET(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/documents/[docId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, docId } = await ctx.params;

  const { data } = await member.supabase
    .from("documents")
    .select("filename, extraction_status, extraction_error, extracted_text")
    .eq("id", docId)
    .eq("evaluation_id", id)
    .maybeSingle();
  if (!data) return jsonError(404, "Document not found.");

  return Response.json({
    filename: data.filename,
    status: data.extraction_status,
    error: data.extraction_error,
    text: data.extracted_text ?? "",
  });
}

// Remove a document, its file and the images read from it (decision 45). The
// database allows this only before the Source Table is built.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/documents/[docId]">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id, docId } = await ctx.params;

  const { data, error } = await member.supabase
    .from("documents")
    .delete()
    .eq("id", docId)
    .eq("evaluation_id", id)
    .select("storage_path");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "Document not found.");

  const storage = member.supabase.storage.from("deal-documents");
  const folder = `${data[0].storage_path.split("/")[0]}/${id}/visuals/${docId}`;
  const { data: visuals } = await storage.list(folder);
  const { error: storageError } = await storage.remove([data[0].storage_path, ...(visuals ?? []).map((f) => `${folder}/${f.name}`)]);
  if (storageError) return jsonError(500, "The document was removed, but its file couldn't be deleted.");

  return new Response(null, { status: 204 });
}
