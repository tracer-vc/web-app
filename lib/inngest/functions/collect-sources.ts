import "server-only";

import type { TierDefinitions } from "@/lib/config-shared";
import { callLlm } from "@/lib/llm/call";
import { LlmError } from "@/lib/llm/client";
import { fitDocuments } from "@/lib/llm/prompts/p1a-quick-screen-answers";
import { P2, type P2Output } from "@/lib/llm/prompts/p2-classify-source";
import { P3 } from "@/lib/llm/prompts/p3-search-queries";
import { P4 } from "@/lib/llm/prompts/p4-source-conflicts";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalUrl, searchWeb, WebSearchError, type WebHit } from "@/lib/web-search";
import { inngest, SOURCES_COLLECT, type SourcesCollectData } from "../client";

// Characters of one document shown to P2, of one web page kept as a source,
// and of all sources together shown to P4.
const DOCUMENT_BUDGET = 60_000;
const WEB_PAGE_BUDGET = 30_000;
const CONFLICT_BUDGET = 150_000;
// Decision 36: results per query and web sources per deal.
const RESULTS_PER_QUERY = 4;
const MAX_WEB_SOURCES = 12;

type Classification = Pick<P2Output, "title" | "tier" | "party" | "relevance_note"> & {
  publishedAt: string | null;
  promptIds: string[];
};
type Outcome =
  | { kind: "source"; c: Classification }
  | { kind: "warning"; message: string }
  | { kind: "note"; message: string };

type Ctx = {
  fundId: string;
  model: string;
  company: string;
  tiers: TierDefinitions;
  prompts: { id: string; ref: string; question: string }[];
};

// LLM failures that stop the whole run (configuration problems); anything
// else becomes a warning on the item (decision 25).
const isFatal = (e: unknown) =>
  e instanceof LlmError && (e.kind === "auth" || e.kind === "missing_key" || e.kind === "model");
const describe = (e: unknown) =>
  e instanceof LlmError ? (e.detail ?? e.userMessage) : e instanceof Error ? e.message : String(e);

async function classify(
  ctx: Ctx,
  ids: { runId: string; evaluationId: string },
  label: string,
  text: string,
  fallbackDate: string | null,
): Promise<Outcome> {
  try {
    const { output } = await callLlm(
      P2,
      {
        company: ctx.company,
        tiers: ctx.tiers,
        prompts: ctx.prompts.map(({ ref, question }) => ({ ref, question })),
        document: { filename: label, text: text.slice(0, DOCUMENT_BUDGET), truncated: text.length > DOCUMENT_BUDGET },
      },
      { fundId: ctx.fundId, model: ctx.model, ...ids },
    );
    if (!output.relevant) {
      return { kind: "note", message: `${label}: not relevant (${output.relevance_note || "no useful information"}), skipped.` };
    }
    const byRef = new Map(ctx.prompts.map((p) => [p.ref, p.id]));
    return {
      kind: "source",
      c: {
        title: output.title.trim(),
        tier: output.tier,
        party: output.party.trim(),
        relevance_note: output.relevance_note.trim(),
        publishedAt: output.published_at ?? fallbackDate,
        promptIds: output.prompt_refs.map((r) => byRef.get(r)!),
      },
    };
  } catch (e) {
    if (isFatal(e)) throw e;
    return { kind: "warning", message: `${label}: classification failed (${describe(e)}).` };
  }
}

// Step 2b (M7 + M8): P2 per uploaded document; unless "uploads only" is on,
// P3 → Tavily → P2 per web hit; then P4 over all sources; finally sources and
// source conflicts are written in one transaction (S# and CR# in order).
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
    const ids = { runId, evaluationId };
    const setProgress = (p: number) =>
      createAdminClient().from("pipeline_runs").update({ progress: Math.min(99, Math.round(p)) }).eq("id", runId);

    const loaded = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin.from("pipeline_runs").update({ status: "running", started_at: new Date().toISOString(), progress: 0 }).eq("id", runId);
      const { data: ev, error } = await admin
        .from("evaluations")
        .select(
          "fund_id, uploads_only, config_id, company:companies(name, stage, sector, website), fund:funds(llm_model), config:framework_configs(tier_definitions), memo:quick_screen_memos(uncertainties)",
        )
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
        ctx: {
          fundId: ev.fund_id,
          model: ev.fund.llm_model,
          company: ev.company.name,
          tiers: ev.config.tier_definitions as TierDefinitions,
          prompts: prompts.map((p, i) => ({ id: p.id, ref: `P${i + 1}`, question: p.question })),
        } satisfies Ctx,
        company: ev.company,
        uploadsOnly: ev.uploads_only,
        uncertainties: ev.memo?.uncertainties ?? [],
        docs,
      };
    });
    const { ctx, docs } = loaded;
    const uploadShare = loaded.uploadsOnly ? 85 : 35;

    // 1. uploads
    const uploads: { documentId: string; accessedAt: string; outcome: Outcome }[] = [];
    for (const [i, doc] of docs.entries()) {
      const outcome = await step.run(`classify ${doc.filename} (${doc.id})`, async (): Promise<Outcome> => {
        let result: Outcome;
        if (doc.extraction_status !== "extracted") {
          result = { kind: "note", message: `${doc.filename}: skipped, no text was extracted.` };
        } else {
          const { data } = await createAdminClient().from("documents").select("extracted_text").eq("id", doc.id).single();
          const text = data?.extracted_text ?? "";
          result = text.trim()
            ? await classify(ctx, ids, doc.filename, text, null)
            : { kind: "warning", message: `${doc.filename}: its extracted text is empty.` };
        }
        await setProgress(((i + 1) / docs.length) * uploadShare);
        return result;
      });
      uploads.push({ documentId: doc.id, accessedAt: doc.created_at.slice(0, 10), outcome });
    }

    // 2. web search (decisions 5, 28, 36)
    const web: { hit: WebHit; outcome: Outcome }[] = [];
    const webMessages: { warnings: string[]; notes: string[] } = { warnings: [], notes: [] };
    if (!loaded.uploadsOnly) {
      const plan = await step.run("plan web search", async () => {
        const covered = new Set(uploads.flatMap((u) => (u.outcome.kind === "source" ? u.outcome.c.promptIds : [])));
        try {
          const { output } = await callLlm(
            P3,
            {
              company: loaded.company,
              prompts: ctx.prompts.map((p) => ({ ref: p.ref, question: p.question, covered: covered.has(p.id) })),
              uncertainties: loaded.uncertainties,
            },
            { fundId: ctx.fundId, model: ctx.model, ...ids },
          );
          await setProgress(uploadShare + 5);
          return { queries: output.queries.map((q) => q.q.trim()), error: null as string | null };
        } catch (e) {
          if (isFatal(e)) throw e;
          return { queries: [] as string[], error: `Web search skipped: planning the queries failed (${describe(e)}).` };
        }
      });
      if (plan.error) webMessages.warnings.push(plan.error);

      const search = await step.run("search the web", async () => {
        const seen = new Set<string>();
        const hits: WebHit[] = [];
        const warnings: string[] = [];
        for (const q of plan.queries) {
          let results: WebHit[];
          try {
            results = await searchWeb(q, RESULTS_PER_QUERY);
          } catch (e) {
            const err = e instanceof WebSearchError ? e : new WebSearchError("unavailable", describe(e));
            warnings.push(`Web search "${q}": ${err.message}.`);
            if (err.kind === "auth" || err.kind === "missing_key" || err.kind === "quota") break;
            continue;
          }
          for (const r of results) {
            const key = canonicalUrl(r.url);
            if (seen.has(key)) continue;
            seen.add(key);
            if (!r.text) {
              warnings.push(`${r.url}: no page text could be fetched (paywall or blocked), skipped.`);
              continue;
            }
            if (hits.length < MAX_WEB_SOURCES) hits.push({ ...r, text: r.text.slice(0, WEB_PAGE_BUDGET) });
          }
        }
        await setProgress(uploadShare + 10);
        return { hits, warnings, queries: plan.queries.length };
      });
      webMessages.warnings.push(...search.warnings);
      webMessages.notes.push(`Web search: ${search.queries} queries, ${search.hits.length} pages with text.`);

      for (const [i, hit] of search.hits.entries()) {
        const outcome = await step.run(`classify web ${i + 1}: ${hit.url.slice(0, 80)}`, async () => {
          const date = hit.publishedAt && !Number.isNaN(Date.parse(hit.publishedAt)) ? new Date(hit.publishedAt).toISOString().slice(0, 10) : null;
          const result = await classify(ctx, ids, hit.url, hit.text, date);
          await setProgress(uploadShare + 10 + ((i + 1) / search.hits.length) * 40);
          return result;
        });
        web.push({ hit, outcome });
      }
    }

    // 3. source list in final order (uploads, then web) and P4 over it
    const sources = [
      ...uploads.flatMap((u) =>
        u.outcome.kind === "source" ? [{ origin: "upload" as const, documentId: u.documentId, url: null, accessedAt: u.accessedAt, c: u.outcome.c }] : [],
      ),
      ...web.flatMap((w) =>
        w.outcome.kind === "source"
          ? [{ origin: "web" as const, documentId: null, url: w.hit.url, accessedAt: new Date().toISOString().slice(0, 10), c: w.outcome.c }]
          : [],
      ),
    ];

    const found = await step.run("find source conflicts", async () => {
      if (sources.length < 2) return { conflicts: [] as { a: number; b: number; description: string; passage_a: string; passage_b: string }[], warning: null as string | null };
      const texts = await sourceTexts(sources, web);
      const fitted = fitDocuments(texts.map((text) => ({ text })), CONFLICT_BUDGET);
      try {
        const { output } = await callLlm(
          P4,
          {
            sources: sources.map((s, i) => ({
              ref: `S${i + 1}`,
              title: s.c.title,
              tier: s.c.tier,
              party: s.c.party,
              text: fitted[i].shown,
              fullText: texts[i],
              truncated: fitted[i].truncated,
            })),
          },
          { fundId: ctx.fundId, model: ctx.model, ...ids },
        );
        await setProgress(95);
        return {
          conflicts: output.conflicts.map((c) => ({
            a: Number(c.source_a.slice(1)) - 1,
            b: Number(c.source_b.slice(1)) - 1,
            description: c.description.trim(),
            passage_a: c.passage_a.trim(),
            passage_b: c.passage_b.trim(),
          })),
          warning: null,
        };
      } catch (e) {
        if (isFatal(e)) throw e;
        return { conflicts: [], warning: `Conflict check failed (${describe(e)}); no source conflicts recorded.` };
      }
    });

    return step.run("record sources", async () => {
      const texts = await sourceTexts(sources, web);
      const outcomes = [...uploads.map((u) => u.outcome), ...web.map((w) => w.outcome)];
      const warnings = [
        ...outcomes.filter((o) => o.kind === "warning").map((o) => o.message),
        ...webMessages.warnings,
        ...(found.warning ? [found.warning] : []),
      ];
      const notes = [...outcomes.filter((o) => o.kind === "note").map((o) => o.message), ...webMessages.notes];

      const { data: count, error } = await createAdminClient().rpc("record_sources", {
        p_evaluation_id: evaluationId,
        p_run_id: runId,
        p_sources: sources.map((s, i) => ({
          document_id: s.documentId,
          origin: s.origin,
          title: s.c.title,
          url: s.url,
          tier: s.c.tier,
          party: s.c.party,
          published_at: s.c.publishedAt,
          accessed_at: s.accessedAt,
          relevance_note: s.c.relevance_note,
          content_text: texts[i],
          prompt_ids: s.c.promptIds,
        })),
        p_conflicts: found.conflicts,
        p_warnings: warnings,
        p_notes: notes,
      });
      if (error) throw error;
      return { sources: count, conflicts: found.conflicts.length, warnings: warnings.length };
    });
  },
);

// Full text per source: uploads from their document, web pages from the hit.
async function sourceTexts(
  sources: { origin: "upload" | "web"; documentId: string | null; url: string | null }[],
  web: { hit: WebHit }[],
): Promise<string[]> {
  const docIds = sources.filter((s) => s.documentId).map((s) => s.documentId!);
  const docText = new Map<string, string>();
  if (docIds.length) {
    const { data, error } = await createAdminClient().from("documents").select("id, extracted_text").in("id", docIds);
    if (error) throw error;
    for (const d of data) docText.set(d.id, d.extracted_text ?? "");
  }
  const webText = new Map(web.map((w) => [w.hit.url, w.hit.text]));
  return sources.map((s) => (s.documentId ? (docText.get(s.documentId) ?? "") : (webText.get(s.url!) ?? "")));
}
