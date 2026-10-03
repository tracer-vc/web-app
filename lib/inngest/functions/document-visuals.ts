import "server-only";

import { V1 } from "@/lib/llm/prompts/v1-read-visual";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { collectVisuals } from "@/lib/visual/collect";
import { appendVisualSection, type VisualBlock } from "@/lib/visual/section";
import { DOCUMENT_VISUALS, inngest, type DocumentVisualsData } from "../client";
import { callLlmStep, describe, isFatal } from "../errors";

const BUCKET = "deal-documents";
const BATCH = 4; // images read in parallel per step

type Item = {
  position: number;
  kind: "page" | "image" | "chart";
  locator: string;
  context: string;
  storagePath: string | null;
  mimeType: string | null;
  chartText: string | null;
};
type Read = { position: number; informative: boolean; transcription: string | null; llmCallId: string | null; error: string | null };

// Decision 45: after text extraction, read the document's visual content.
// Prepare (render PDF pages / extract Office images and charts, store the
// images) → V1 per image in batches → append the informative blocks to the
// document text and record each visual, in one transaction.
export const documentVisuals = inngest.createFunction(
  {
    id: "document-visuals",
    triggers: [{ event: DOCUMENT_VISUALS }],
    concurrency: { limit: 1, key: "event.data.documentId" },
    retries: 1,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: DocumentVisualsData } }).event.data;
      await createAdminClient()
        .from("documents")
        .update({ visual_status: "failed", visual_error: error.message })
        .eq("id", data.documentId);
    },
  },
  async ({ event, step }) => {
    const { documentId } = event.data as DocumentVisualsData;

    const prep = await step.run("prepare visuals", async () => {
      const admin = createAdminClient();
      const { data: doc, error } = await admin
        .from("documents")
        .select("id, evaluation_id, fund_id, storage_path, mime_type, filename, evaluation:evaluations(fund:funds(llm_model))")
        .eq("id", documentId)
        .single();
      if (error) throw error;
      await admin.from("documents").update({ visual_status: "running", visual_error: null }).eq("id", documentId);
      const { data: file, error: dlError } = await admin.storage.from(BUCKET).download(doc.storage_path);
      if (dlError || !file) throw dlError ?? new Error("the document file is missing");
      const { items, skipped } = await collectVisuals(doc.mime_type, new Uint8Array(await file.arrayBuffer()));

      const stored: Item[] = [];
      for (const [i, item] of items.entries()) {
        const position = i + 1;
        if (item.kind === "chart") {
          stored.push({ position, kind: "chart", locator: item.locator, context: item.context, storagePath: null, mimeType: null, chartText: item.chartText });
          continue;
        }
        const path = `${doc.fund_id}/${doc.evaluation_id}/visuals/${doc.id}/${position}.${item.image.ext}`;
        const { error: upError } = await admin.storage
          .from(BUCKET)
          .upload(path, item.image.bytes, { contentType: item.image.mimeType, upsert: true });
        if (upError) throw upError;
        stored.push({
          position,
          kind: item.kind,
          locator: item.locator,
          context: item.context.slice(0, 4000),
          storagePath: path,
          mimeType: item.image.mimeType,
          chartText: null,
        });
      }
      return {
        evaluationId: doc.evaluation_id,
        fundId: doc.fund_id,
        model: doc.evaluation.fund.llm_model,
        filename: doc.filename,
        items: stored,
        skipped,
      };
    });

    const toRead = prep.items.filter((i) => i.storagePath);
    const reads: Read[] = [];
    for (let b = 0; b < toRead.length; b += BATCH) {
      const batch = toRead.slice(b, b + BATCH);
      const results = await step.run(`read visuals ${b + 1}-${b + batch.length}`, async () => {
        const admin = createAdminClient();
        return Promise.all(
          batch.map(async (item): Promise<Read> => {
            try {
              const { data: img, error } = await admin.storage.from(BUCKET).download(item.storagePath!);
              if (error || !img) throw error ?? new Error("stored image missing");
              const base64 = Buffer.from(await img.arrayBuffer()).toString("base64");
              const { output, llmCallId } = await callLlmStep(
                V1,
                { document: prep.filename, locator: item.locator, pageText: item.context, image: { mimeType: item.mimeType!, base64 } },
                { fundId: prep.fundId, model: prep.model, evaluationId: prep.evaluationId, runId: null },
              );
              return {
                position: item.position,
                informative: output.informative,
                transcription: output.informative ? output.transcription.trim() : null,
                llmCallId,
                error: null,
              };
            } catch (e) {
              if (isFatal(e)) throw e;
              return { position: item.position, informative: false, transcription: null, llmCallId: null, error: describe(e) };
            }
          }),
        );
      });
      reads.push(...results);
    }

    return step.run("record visuals", async () => {
      const admin = createAdminClient();
      const { data: doc, error } = await admin.from("documents").select("extracted_text").eq("id", documentId).single();
      if (error) throw error;
      const readBy = new Map(reads.map((r) => [r.position, r]));
      const blocks: VisualBlock[] = prep.items.flatMap((i): VisualBlock[] => {
        if (i.kind === "chart") return [{ position: i.position, locator: i.locator, origin: "chart", text: i.chartText! }];
        const r = readBy.get(i.position);
        return r?.informative && r.transcription ? [{ position: i.position, locator: i.locator, origin: "image", text: r.transcription }] : [];
      });
      const { text, ranges } = appendVisualSection(doc.extracted_text, blocks);
      const rangeOf = new Map(ranges.map((r) => [r.position, r]));
      const visuals = prep.items.map((i) => {
        const r = readBy.get(i.position);
        const range = rangeOf.get(i.position);
        return {
          position: i.position,
          kind: i.kind,
          locator: i.locator,
          storage_path: range ? i.storagePath : null, // non-informative images are not kept
          mime_type: range ? i.mimeType : null,
          informative: !!range,
          transcription: range ? (i.kind === "chart" ? i.chartText : r!.transcription) : null,
          text_start: range?.start ?? null,
          text_end: range?.end ?? null,
          llm_call_id: r?.llmCallId ?? null,
        };
      });
      const failed = reads.filter((r) => r.error);
      const images = prep.items.filter((i) => i.kind !== "chart").length;
      const charts = prep.items.filter((i) => i.kind === "chart").length;
      const summary = prep.items.length
        ? [
            `${images} ${images === 1 ? "image" : "images"} read, ${blocks.filter((b) => b.origin === "image").length} with information`,
            charts ? `${charts} ${charts === 1 ? "chart" : "charts"} read from data` : null,
            failed.length ? `${failed.length} could not be read` : null,
            ...prep.skipped.slice(0, 3),
          ]
            .filter(Boolean)
            .join(" · ")
        : "No images or charts found";
      const allFailed = toRead.length > 0 && failed.length === toRead.length && charts === 0;
      const { error: rpcError } = await admin.rpc("record_document_visuals", {
        p_document_id: documentId,
        p_text: text,
        p_visuals: visuals as unknown as Json,
        p_status: allFailed ? "failed" : "done",
        p_error: allFailed ? `None of the images could be read: ${failed[0].error}` : null,
        p_summary: summary,
      });
      if (rpcError) throw rpcError;
      const unused = prep.items.filter((i) => i.storagePath && !rangeOf.has(i.position)).map((i) => i.storagePath!);
      if (unused.length) await admin.storage.from(BUCKET).remove(unused);
      return { blocks: blocks.length, failed: failed.length };
    });
  },
);
