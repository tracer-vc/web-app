import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { DealRow, EvaluationView } from "@/lib/evaluation-shared";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// RLS limits every query to the caller's fund.

export async function listDeals(supabase: Supabase): Promise<DealRow[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select(
      `id, status, current_step, updated_at,
       company:companies(name, stage, sector),
       config:framework_configs(version),
       memo:quick_screen_memos(verdict, verdict_overridden_at)`,
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return data.map((e) => ({
    id: e.id,
    name: e.company.name,
    stage: e.company.stage,
    sector: e.company.sector,
    status: e.status,
    currentStep: e.current_step,
    verdict: e.memo?.verdict ?? null,
    overridden: !!e.memo?.verdict_overridden_at,
    configVersion: e.config.version,
    updatedAt: e.updated_at,
  }));
}

export async function loadEvaluation(supabase: Supabase, id: string): Promise<EvaluationView | null> {
  const { data: e, error } = await supabase
    .from("evaluations")
    .select(
      `id, fund_id, status, current_step, uploads_only, updated_at, config_id,
       company:companies(name, stage, sector, website),
       config:framework_configs(version),
       evaluator:profiles(display_name),
       answers:quick_screen_answers(question_id, answer, origin, ai_answer, found_in_materials,
         citations:quick_screen_answer_citations(document_id, excerpt, document:documents(filename))),
       documents(id, filename, mime_type, bytes, extraction_status, created_at),
       memo:quick_screen_memos(preliminary_thesis, verdict, original_verdict, justification, uncertainties,
         reopen_condition, gating_variable, reeval_trigger, verdict_overridden_at, override_reason,
         overrider:profiles!quick_screen_memos_verdict_overridden_by_fkey(display_name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!e) return null;

  const { data: questions, error: qError } = await supabase
    .from("quick_screen_questions")
    .select("id, label, question")
    .eq("config_id", e.config_id)
    .order("position");
  if (qError) throw qError;

  const m = e.memo;
  return {
    id: e.id,
    fundId: e.fund_id,
    status: e.status,
    currentStep: e.current_step,
    uploadsOnly: e.uploads_only,
    updatedAt: e.updated_at,
    company: e.company,
    configVersion: e.config.version,
    evaluator: e.evaluator?.display_name ?? null,
    questions,
    answers: Object.fromEntries(
      e.answers.map((a) => [
        a.question_id,
        {
          answer: a.answer,
          origin: a.origin,
          aiAnswer: a.ai_answer,
          foundInMaterials: a.found_in_materials,
          citations: a.citations.map((c) => ({
            documentId: c.document_id,
            filename: c.document.filename,
            excerpt: c.excerpt,
          })),
        },
      ]),
    ),
    documents: [...e.documents]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        mimeType: d.mime_type,
        bytes: d.bytes,
        status: d.extraction_status,
        createdAt: d.created_at,
      })),
    memo: m
      ? {
          thesis: m.preliminary_thesis,
          verdict: m.verdict,
          originalVerdict: m.original_verdict,
          justification: m.justification,
          uncertainties: m.uncertainties,
          reopenCondition: m.reopen_condition,
          gatingVariable: m.gating_variable,
          reevalTrigger: m.reeval_trigger,
          overridden: m.verdict_overridden_at
            ? { by: m.overrider?.display_name ?? null, at: m.verdict_overridden_at, reason: m.override_reason ?? "" }
            : null,
        }
      : null,
  };
}
