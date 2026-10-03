import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { MAX_DOCUMENT_BYTES } from "@/lib/evaluation-shared";
import { DOCUMENT_TYPES, extractDocumentText } from "@/lib/extract";
import { DOCUMENT_VISUALS, inngest } from "@/lib/inngest/client";
import { hasVisuals } from "@/lib/visual/collect";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  id: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().refine((m) => m in DOCUMENT_TYPES, { error: "unsupported file type" }),
  bytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES, { error: "files can be at most 20 MB" }),
});

// The browser has uploaded the file to deal-documents/{fund}/{evaluation}/{id}.{ext}
// (storage policies mirror evaluations). Register it, extract its text, and
// queue reading its visual content in the background (decision 45).
// Metadata is written as the user (RLS + limits); text by the server.
export async function POST(request: Request, ctx: RouteContext<"/api/evaluations/[id]/documents">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id: evaluationId } = await ctx.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message);
  const { id, filename, mime_type, bytes } = parsed.data;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");

  const path = `${evaluation.fund_id}/${evaluationId}/${id}.${DOCUMENT_TYPES[mime_type].ext}`;
  const admin = createAdminClient();

  const { error: insertError } = await member.supabase
    .from("documents")
    .insert({ id, evaluation_id: evaluationId, fund_id: evaluation.fund_id, storage_path: path, filename, mime_type, bytes });
  if (insertError) {
    await admin.storage.from("deal-documents").remove([path]);
    return dbErrorResponse(insertError);
  }

  const { data: file, error: downloadError } = await admin.storage.from("deal-documents").download(path);
  if (downloadError || !file) {
    await admin.from("documents").delete().eq("id", id);
    return jsonError(400, "The upload didn't arrive. Try again.");
  }

  const result = await extractDocumentText(mime_type, new Uint8Array(await file.arrayBuffer()));
  const { error: updateError } = await admin
    .from("documents")
    .update(
      result.status === "failed"
        ? { extraction_status: "failed", extraction_error: result.error }
        : { extraction_status: result.status, extracted_text: result.text },
    )
    .eq("id", id);
  if (updateError) return dbErrorResponse(updateError);

  let visualStatus: "none" | "pending" | "failed" = "none";
  if (result.status !== "failed" && hasVisuals(mime_type)) {
    visualStatus = "pending";
    await admin.from("documents").update({ visual_status: "pending" }).eq("id", id);
    try {
      await inngest.send({ name: DOCUMENT_VISUALS, data: { documentId: id } });
    } catch (e) {
      visualStatus = "failed";
      const detail = e instanceof Error ? e.message : String(e);
      await admin
        .from("documents")
        .update({ visual_status: "failed", visual_error: `Couldn't start reading the images: ${detail}` })
        .eq("id", id);
    }
  }

  return Response.json({ id, status: result.status, visualStatus }, { status: 201 });
}
