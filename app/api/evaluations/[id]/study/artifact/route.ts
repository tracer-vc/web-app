import { randomUUID } from "node:crypto";
import { adminContext, dbErrorResponse, jsonError } from "@/lib/api";
import { inngest, STUDY_ARTIFACT } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "deal-documents";

// Study 2: "Run artifact again" (decision 44). Copies the deal (same company,
// config version, Quick Screen and documents) as a hidden study copy and runs
// steps 2b–6 on it in the background. Fund admins only.
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/study/artifact">) {
  const member = await adminContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, study_parent_id")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (evaluation.study_parent_id) return jsonError(409, "Copy the original deal, not a study copy.");

  const admin = createAdminClient();
  const { data: docs, error: docsError } = await admin
    .from("documents")
    .select(
      "id, storage_path, filename, mime_type, bytes, extracted_text, extraction_status, extraction_error, visual_status, visual_summary, visual_error, visuals:document_visuals(position, kind, locator, storage_path, mime_type, informative, transcription, text_start, text_end, llm_call_id)",
    )
    .eq("evaluation_id", id)
    .order("created_at");
  if (docsError) return dbErrorResponse(docsError);
  if (!docs.some((d) => d.extraction_status === "extracted")) return jsonError(409, "The deal has no document with readable text.");

  const { data: copyId, error } = await admin.rpc("create_study_copy", { p_parent_id: id, p_actor_id: member.user.id });
  if (error) return error.code === "23514" ? jsonError(409, error.message) : dbErrorResponse(error);

  // Documents: same files and extracted text under the copy's own paths.
  const copied: string[] = [];
  try {
    const { data: copy } = await admin.from("evaluations").select("fund_id, study_run").eq("id", copyId).single();
    for (const d of docs) {
      const docId = randomUUID();
      const ext = d.storage_path.slice(d.storage_path.lastIndexOf("."));
      const path = `${copy!.fund_id}/${copyId}/${docId}${ext}`;
      const { error: copyError } = await admin.storage.from(BUCKET).copy(d.storage_path, path);
      if (copyError) throw copyError;
      copied.push(path);
      const { error: insertError } = await admin.from("documents").insert({
        id: docId,
        evaluation_id: copyId,
        fund_id: copy!.fund_id,
        storage_path: path,
        filename: d.filename,
        mime_type: d.mime_type,
        bytes: d.bytes,
        extracted_text: d.extracted_text,
        extraction_status: d.extraction_status,
        extraction_error: d.extraction_error,
        uploaded_by: member.user.id,
      });
      if (insertError) throw insertError;

      // The images read from it (decision 45): same files, same text blocks.
      if (d.visual_status !== "none") {
        const visuals = [];
        for (const v of d.visuals) {
          let storagePath: string | null = null;
          if (v.storage_path) {
            storagePath = `${copy!.fund_id}/${copyId}/visuals/${docId}/${v.storage_path.split("/").pop()}`;
            const { error: vCopyError } = await admin.storage.from(BUCKET).copy(v.storage_path, storagePath);
            if (vCopyError) throw vCopyError;
            copied.push(storagePath);
          }
          visuals.push({ ...v, storage_path: storagePath });
        }
        const { error: visualsError } = await admin.rpc("record_document_visuals", {
          p_document_id: docId,
          p_text: d.extracted_text ?? "",
          p_visuals: visuals,
          p_status: d.visual_status,
          p_error: d.visual_error,
          p_summary: d.visual_summary,
        });
        if (visualsError) throw visualsError;
      }
    }
    await inngest.send({ name: STUDY_ARTIFACT, data: { evaluationId: copyId, actorId: member.user.id } });
    return Response.json({ copyId, run: copy!.study_run }, { status: 202 });
  } catch (e) {
    if (copied.length) await admin.storage.from(BUCKET).remove(copied);
    await admin.from("evaluations").delete().eq("id", copyId);
    const detail = e instanceof Error ? e.message : String(e);
    return jsonError(500, `Couldn't start the artifact run: ${detail}`);
  }
}
