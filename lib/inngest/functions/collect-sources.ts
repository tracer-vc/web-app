import "server-only";

import type { TierDefinitions } from "@/lib/config-shared";
import { callLlm } from "@/lib/llm/call";
import { LlmError } from "@/lib/llm/client";
import { P2 } from "@/lib/llm/prompts/p2-classify-source";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest, SOURCES_COLLECT, type SourcesCollectData } from "../client";

// Characters of one document shown to P2.
const DOCUMENT_BUDGET = 60_000;

type Classified =
  | {
      kind: "source";
      documentId: string;
      title: string;
      tier: "primary" | "secondary" | "tertiary";
      party: string;
      publishedAt: string | null;
      relevanceNote: string;
      promptIds: string[];
      accessedAt: string;
    }
  | { kind: "warning"; message: string }
  | { kind: "note"; message: string };

// Step 2b (uploads part, M7): P2 per document, then all sources written at
// once in upload order (S1…Sn). A failing document becomes a warning and the
// run ends done_with_warnings (decision 25). Web search arrives in M8.
export const collectSources = inngest.createFunction(
  {
    id: "collect-sources",
    triggers: [{ event: SOURCES_COLLECT }],
    concurrency: { limit: 1, key: "event.data.evaluationId" },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: SourcesCollectData } }).event.data;
      await failRun(createAdminClient(), data.runId, `Source Table run failed: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const { evaluationId, runId } = event.data as SourcesCollectData;

    const ctx = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin
        .from("pipeline_runs")
        .update({ status: "running", started_at: new Date().toISOString(), progress: 0 })
        .eq("id", runId);

      const { data: ev, error } = await admin
        .from("evaluations")
        .select("fund_id, uploads_only, config_id, company:companies(name), fund:funds(llm_model), config:framework_configs(tier_definitions)")
        .eq("id", evaluationId)
        .single();
      if (error) throw error;

      const [{ data: prompts, error: pErr }, { data: docs, error: dErr }] = await Promise.all([
        admin.from("collection_prompts").select("id, question").eq("config_id", ev.config_id).order("position"),
        admin.from("documents").select("id, filename, extraction_status, created_at").eq("evaluation_id", evaluationId).order("created_at"),
      ]);
      if (pErr) throw pErr;
      if (dErr) throw dErr;

      return {
        fundId: ev.fund_id,
        uploadsOnly: ev.uploads_only,
        company: ev.company.name,
        model: ev.fund.llm_model,
        tiers: ev.config.tier_definitions as TierDefinitions,
        prompts: prompts.map((p, i) => ({ id: p.id, ref: `P${i + 1}`, question: p.question })),
        docs,
      };
    });

    const results: Classified[] = [];
    for (const [i, doc] of ctx.docs.entries()) {
      const result = await step.run(`classify ${doc.filename} (${doc.id})`, async (): Promise<Classified> => {
        const admin = createAdminClient();
        const progress = async () =>
          admin.from("pipeline_runs").update({ progress: Math.round(((i + 1) / ctx.docs.length) * 95) }).eq("id", runId);

        if (doc.extraction_status !== "extracted") {
          await progress();
          return { kind: "note", message: `${doc.filename}: skipped, no text was extracted.` };
        }
        const { data } = await admin.from("documents").select("extracted_text").eq("id", doc.id).single();
        const text = data?.extracted_text ?? "";
        if (!text.trim()) {
          await progress();
          return { kind: "warning", message: `${doc.filename}: its extracted text is empty.` };
        }

        try {
          const { output } = await callLlm(
            P2,
            {
              company: ctx.company,
              tiers: ctx.tiers,
              prompts: ctx.prompts.map(({ ref, question }) => ({ ref, question })),
              document: { filename: doc.filename, text: text.slice(0, DOCUMENT_BUDGET), truncated: text.length > DOCUMENT_BUDGET },
            },
            { fundId: ctx.fundId, model: ctx.model, runId, evaluationId },
          );
          await progress();
          if (!output.relevant) {
            return { kind: "note", message: `${doc.filename}: not relevant (${output.relevance_note || "no useful information"}), skipped.` };
          }
          const byRef = new Map(ctx.prompts.map((p) => [p.ref, p.id]));
          return {
            kind: "source",
            documentId: doc.id,
            title: output.title.trim(),
            tier: output.tier,
            party: output.party.trim(),
            publishedAt: output.published_at,
            relevanceNote: output.relevance_note.trim(),
            promptIds: output.prompt_refs.map((r) => byRef.get(r)!),
            accessedAt: doc.created_at.slice(0, 10),
          };
        } catch (e) {
          // Auth/model errors fail the whole run; anything else is this document's warning.
          if (e instanceof LlmError && (e.kind === "auth" || e.kind === "missing_key" || e.kind === "model")) throw e;
          await progress();
          const message = e instanceof LlmError ? (e.detail ?? e.userMessage) : e instanceof Error ? e.message : String(e);
          return { kind: "warning", message: `${doc.filename}: classification failed (${message}).` };
        }
      });
      results.push(result);
    }

    return step.run("record sources", async () => {
      const admin = createAdminClient();
      const sources = results.filter((r): r is Extract<Classified, { kind: "source" }> => r.kind === "source");
      const texts = new Map<string, string>();
      if (sources.length) {
        const { data, error } = await admin.from("documents").select("id, extracted_text").in("id", sources.map((s) => s.documentId));
        if (error) throw error;
        for (const d of data) texts.set(d.id, d.extracted_text ?? "");
      }

      const warnings = results.filter((r) => r.kind === "warning").map((r) => r.message);
      const notes = results.filter((r) => r.kind === "note").map((r) => r.message);
      if (!ctx.uploadsOnly) notes.push("Web search is not part of this run yet (arrives in M8).");

      const { data: count, error } = await admin.rpc("record_sources", {
        p_evaluation_id: evaluationId,
        p_run_id: runId,
        p_sources: sources.map((s) => ({
          document_id: s.documentId,
          origin: "upload",
          title: s.title,
          tier: s.tier,
          party: s.party,
          published_at: s.publishedAt,
          accessed_at: s.accessedAt,
          relevance_note: s.relevanceNote,
          content_text: texts.get(s.documentId),
          prompt_ids: s.promptIds,
        })),
        p_warnings: warnings,
        p_notes: notes,
      });
      if (error) throw error;
      return { sources: count, warnings: warnings.length, notes: notes.length };
    });
  },
);
