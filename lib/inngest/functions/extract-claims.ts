import "server-only";

import type { ConfidenceRules, Tier } from "@/lib/config-shared";
import { checkClaimExcerpts, ExcerptIndex } from "@/lib/excerpt";
import { LlmError } from "@/lib/llm/client";
import { claimShapeErrors, MAX_CLAIMS_PER_CHUNK, P5, type P5Claim } from "@/lib/llm/prompts/p5-extract-claims";
import { P6, type P6Output } from "@/lib/llm/prompts/p6-merge-claims";
import { P7 } from "@/lib/llm/prompts/p7-open-question";
import { computeConfidence } from "@/lib/rules/confidence";
import {
  applyMerges,
  nearestStatements,
  parentSourceConflict,
  uncoveredRequiredPrompts,
  type Candidate,
  type ClaimType,
  type Link,
} from "@/lib/rules/claims";
import { failRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { CLAIMS_EXTRACT, inngest, type ClaimsExtractData } from "../client";
import { callLlmStep, describe, isFatal } from "../errors";

// Decision 24: P5 runs on chunks of a source; R4 checks against the full text.
const CHUNK_SIZE = 15_000;
const MAX_CHUNKS = 6;

type SourceMeta = { id: string; code: string; title: string; tier: Tier; party: string; chunks: [number, number][]; truncated: boolean };
type Extracted = { type: ClaimType; statement: string; promptIds: string[]; link: Link | null };

// Split at a paragraph, line or sentence break near the end of each window.
function chunkBounds(length: number, text: string): { chunks: [number, number][]; truncated: boolean } {
  const chunks: [number, number][] = [];
  let start = 0;
  while (start < length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(length, start + CHUNK_SIZE);
    if (end < length) {
      const window = text.slice(start + Math.floor(CHUNK_SIZE * 0.8), end);
      const breaks = [window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ")];
      const at = breaks.find((b) => b >= 0);
      if (at !== undefined) end = start + Math.floor(CHUNK_SIZE * 0.8) + at + 1;
    }
    chunks.push([start, end]);
    start = end;
  }
  return { chunks, truncated: start < length };
}

// Step 3 (M9): P5 per source chunk with R4 → P6 merges and contradictions →
// R1 confidence → R2 coverage → P7 per uncovered required prompt → one
// transaction (record_claims) that numbers C#, CR# and U#.
export const extractClaims = inngest.createFunction(
  {
    id: "extract-claims",
    triggers: [{ event: CLAIMS_EXTRACT }],
    concurrency: { limit: 1, key: "event.data.evaluationId" },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = (event.data as { event: { data: ClaimsExtractData } }).event.data;
      await failRun(createAdminClient(), data.runId, error.message);
    },
  },
  async ({ event, step }) => {
    const { evaluationId, runId } = event.data as ClaimsExtractData;
    const ids = { runId, evaluationId };
    const setProgress = (p: number) =>
      createAdminClient().from("pipeline_runs").update({ progress: Math.min(99, Math.round(p)) }).eq("id", runId);

    const loaded = await step.run("load deal", async () => {
      const admin = createAdminClient();
      await admin.from("pipeline_runs").update({ status: "running", started_at: new Date().toISOString(), progress: 0 }).eq("id", runId);
      const { data: ev, error } = await admin
        .from("evaluations")
        .select("fund_id, config_id, company:companies(name), fund:funds(llm_model), config:framework_configs(confidence_rules)")
        .eq("id", evaluationId)
        .single();
      if (error) throw error;
      const [prompts, sources, conflicts] = await Promise.all([
        admin.from("collection_prompts").select("id, question, required").eq("config_id", ev.config_id).order("position"),
        admin.from("sources").select("id, code, title, tier, party, content_text").eq("evaluation_id", evaluationId),
        admin.from("conflicts").select("id, side_a_id, side_b_id").eq("evaluation_id", evaluationId).eq("kind", "source"),
      ]);
      for (const r of [prompts, sources, conflicts]) if (r.error) throw r.error;
      const codeNumber = (code: string) => Number(code.replace(/^\D+/, ""));
      return {
        fundId: ev.fund_id,
        model: ev.fund.llm_model,
        company: ev.company.name,
        rules: ev.config.confidence_rules as ConfidenceRules,
        prompts: prompts.data!.map((p, i) => ({ id: p.id, ref: `P${i + 1}`, question: p.question, required: p.required })),
        sources: [...sources.data!]
          .sort((a, b) => codeNumber(a.code) - codeNumber(b.code))
          .map((s): SourceMeta => ({
            id: s.id,
            code: s.code,
            title: s.title,
            tier: s.tier,
            party: s.party,
            ...chunkBounds(s.content_text.length, s.content_text),
          })),
        sourceConflicts: conflicts.data!.map((c) => ({ id: c.id, sideA: c.side_a_id, sideB: c.side_b_id })),
      };
    });
    const llm = { fundId: loaded.fundId, model: loaded.model, ...ids };
    const promptByRef = new Map(loaded.prompts.map((p) => [p.ref, p.id]));
    const warnings: string[] = loaded.sources
      .filter((s) => s.truncated)
      .map((s) => `${s.code}: longer than ${MAX_CHUNKS} parts; claims were extracted from the first ${MAX_CHUNKS} only.`);

    // 1. P5 per chunk, R4 against the source's full text
    const totalChunks = loaded.sources.reduce((n, s) => n + s.chunks.length, 0);
    const candidates: Extracted[][] = [];
    let done = 0;
    for (const source of loaded.sources) {
      for (const [i, [start, end]] of source.chunks.entries()) {
        const label = source.chunks.length > 1 ? `${source.code} part ${i + 1}/${source.chunks.length}` : source.code;
        const result = await step.run(`extract claims ${label}`, async () => {
          const { data, error } = await createAdminClient().from("sources").select("content_text").eq("id", source.id).single();
          if (error) throw error;
          const index = new ExcerptIndex(data.content_text);
          const input = {
            company: loaded.company,
            source: { ref: source.code, title: source.title, tier: source.tier, party: source.party },
            chunk: { text: data.content_text.slice(start, end), part: i + 1, parts: source.chunks.length },
            index,
            prompts: loaded.prompts.map(({ ref, question }) => ({ ref, question })),
          };
          let claims: P5Claim[];
          const stepWarnings: string[] = [];
          try {
            claims = (await callLlmStep(P5, input, llm)).output.claims;
          } catch (e) {
            if (isFatal(e)) throw e;
            // Decision 37: after the retries, keep the claims that pass R4 and
            // the other rule checks; log every dropped claim.
            const last = e instanceof LlmError ? (e.lastOutput as { claims?: P5Claim[] } | undefined) : undefined;
            if (!last?.claims) {
              stepWarnings.push(`${label}: claim extraction failed (${describe(e)}); no claims from this part.`);
              claims = [];
            } else {
              const refs = new Set(input.prompts.map((p) => p.ref));
              claims = last.claims.slice(0, MAX_CLAIMS_PER_CHUNK).filter((c) => {
                const errors = claimShapeErrors(c, refs);
                if (errors.length) stepWarnings.push(`${label}: claim rejected after retries (${errors.join("; ")}).`);
                return errors.length === 0;
              });
            }
          }
          const { kept, rejected } = checkClaimExcerpts(index, claims);
          for (const r of rejected) {
            stepWarnings.push(`${label}: claim rejected after retries (R4: ${r.reason}): "${r.statement}" (excerpt "${r.excerpt}").`);
          }
          await setProgress(((done + 1) / totalChunks) * 70);
          return {
            claims: kept.map(
              (c): Extracted => ({
                type: c.type,
                statement: c.statement.trim(),
                promptIds: c.prompt_refs.map((r) => promptByRef.get(r)!),
                link: c.span ? { source_id: source.id, excerpt: c.verbatim!, start: c.span.start, end: c.span.end } : null,
              }),
            ),
            warnings: stepWarnings,
          };
        });
        candidates.push(result.claims);
        warnings.push(...result.warnings);
        done++;
      }
    }
    const sourceCode = new Map(loaded.sources.map((s) => [s.id, s.code]));
    const pool: Candidate[] = candidates.flat().map((c, i) => ({
      ref: `K${i + 1}`,
      type: c.type,
      statement: c.statement,
      promptIds: c.promptIds,
      links: c.link ? [c.link] : [],
    }));

    // 2. P6 merges and contradictions over all candidates
    const p6 = await step.run("merge claims and find contradictions", async () => {
      const empty: P6Output = { merges: [], contradictions: [] };
      if (pool.length < 2) return { ...empty, warning: null as string | null };
      try {
        const { output } = await callLlmStep(
          P6,
          {
            claims: pool.map((c) => ({
              ref: c.ref,
              type: c.type,
              statement: c.statement,
              source: c.links.map((l) => sourceCode.get(l.source_id)).join(", ") || "no source",
              excerpt: c.links[0]?.excerpt ?? null,
            })),
          },
          llm,
        );
        await setProgress(85);
        return { ...output, warning: null };
      } catch (e) {
        if (isFatal(e)) throw e;
        return { ...empty, warning: `Merging and the contradiction check failed (${describe(e)}); claims kept unmerged, no claim conflicts recorded.` };
      }
    });
    if (p6.warning) warnings.push(p6.warning);
    const { claims, indexOf } = applyMerges(pool, p6.merges);
    const contradictions = p6.contradictions.map((x) => ({
      a: indexOf.get(x.a)!,
      b: indexOf.get(x.b)!,
      description: x.description.trim(),
    }));

    // 3. R2 coverage, then P7 per uncovered required prompt
    const uncovered = uncoveredRequiredPrompts(claims, loaded.prompts);
    const uncertainties: {
      question: string;
      why_unresolved: string;
      decision_critical: boolean;
      min_evidence_to_resolve: string;
      from_prompt_id: string;
    }[] = [];
    for (const prompt of uncovered) {
      const u = await step.run(`open question ${prompt.ref}`, async () => {
        const nearest = nearestStatements(prompt.question, claims.filter((c) => c.type !== "speculation").map((c) => c.statement));
        try {
          const { output } = await callLlmStep(P7, { company: loaded.company, prompt, nearest }, llm);
          return {
            question: output.question.trim(),
            why_unresolved: output.why_unresolved.trim(),
            decision_critical: output.decision_critical,
            min_evidence_to_resolve: output.min_evidence_to_resolve.trim(),
            warning: null as string | null,
          };
        } catch (e) {
          if (isFatal(e)) throw e;
          // R2 is a rule: the uncertainty is recorded even if phrasing fails.
          return {
            question: prompt.question,
            why_unresolved: "No extracted claim answers this Collection Prompt.",
            decision_critical: true,
            min_evidence_to_resolve: "",
            warning: `${prompt.ref}: phrasing the open question failed (${describe(e)}); the prompt was recorded as is.`,
          };
        }
      });
      if (u.warning) warnings.push(u.warning);
      uncertainties.push({
        question: u.question,
        why_unresolved: u.why_unresolved,
        decision_critical: u.decision_critical,
        min_evidence_to_resolve: u.min_evidence_to_resolve,
        from_prompt_id: prompt.id,
      });
    }

    // 4. R1 confidence and one transaction
    return step.run("record claims", async () => {
      const meta = new Map(loaded.sources.map((s) => [s.id, s]));
      const inConflict = new Set(contradictions.flatMap((x) => [x.a, x.b]));
      const notes = [
        `${pool.length} candidate claims from ${loaded.sources.length} sources; ${pool.length - claims.length} merged as duplicates.`,
        uncovered.length
          ? `${uncovered.length} required Collection Prompt${uncovered.length === 1 ? "" : "s"} without an answering claim → U#.`
          : "Every required Collection Prompt has an answering claim.",
      ];
      const { data: count, error } = await createAdminClient().rpc("record_claims", {
        p_evaluation_id: evaluationId,
        p_run_id: runId,
        p_claims: claims.map((c, i) => {
          const r1 =
            c.type === "speculation"
              ? null
              : computeConfidence(
                  loaded.rules,
                  c.links.map((l) => {
                    const s = meta.get(l.source_id)!;
                    return { code: s.code, tier: s.tier, party: s.party };
                  }),
                  inConflict.has(i),
                );
          return {
            statement: c.statement,
            type: c.type,
            confidence: r1?.level ?? null,
            confidence_basis: r1?.basis ?? null,
            sources: c.links.map((l) => ({ source_id: l.source_id, excerpt: l.excerpt, start: l.start, end: l.end })),
            prompt_ids: c.promptIds,
          };
        }) as Json,
        p_conflicts: contradictions.map((x) => ({
          a: x.a,
          b: x.b,
          description: x.description,
          passage_a: claims[x.a].links[0].excerpt,
          passage_b: claims[x.b].links[0].excerpt,
          parent_conflict_id: parentSourceConflict(claims[x.a], claims[x.b], loaded.sourceConflicts),
        })),
        p_uncertainties: uncertainties,
        p_warnings: warnings,
        p_notes: notes,
      });
      if (error) throw error;
      return { claims: count, conflicts: contradictions.length, uncertainties: uncertainties.length, warnings: warnings.length };
    });
  },
);
