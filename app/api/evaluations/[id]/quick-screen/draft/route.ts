import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { NOT_STATED, QUICK_SCREEN_STATUSES } from "@/lib/evaluation-shared";
import { callLlm } from "@/lib/llm/call";
import { LlmError } from "@/lib/llm/client";
import { P1A, fitDocuments } from "@/lib/llm/prompts/p1a-quick-screen-answers";
import { failRun, startRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";

// Characters of document text sent to the model across all documents.
const DOCUMENT_BUDGET = 240_000;

// Decision 34: draft the Quick Screen answers from the uploaded materials
// (P1a), with verbatim excerpts checked against the extracted text. Replaces
// the current answers; the analyst reviews them before generating the memo.
export async function POST(_request: Request, ctx: RouteContext<"/api/evaluations/[id]/quick-screen/draft">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select("id, fund_id, status, config_id, company:companies(name, stage, sector), fund:funds(llm_model)")
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (!QUICK_SCREEN_STATUSES.includes(evaluation.status)) {
    return jsonError(409, "The Quick Screen can only be redone before Evidence Collection starts.");
  }

  // Decision 45: wait until the images in the materials have been read.
  const { count: reading } = await member.supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("evaluation_id", id)
    .in("visual_status", ["pending", "running"]);
  if (reading) return jsonError(409, "The images in the materials are still being read. Try again in a moment.");

  const [{ data: questions }, { data: documents }] = await Promise.all([
    member.supabase.from("quick_screen_questions").select("id, label, question").eq("config_id", evaluation.config_id).order("position"),
    member.supabase
      .from("documents")
      .select("id, filename, extracted_text")
      .eq("evaluation_id", id)
      .eq("extraction_status", "extracted")
      .order("created_at"),
  ]);
  if (!questions?.length) return jsonError(409, "The fund's configuration has no Quick Screen questions.");
  if (!documents?.length) return jsonError(400, "Upload at least one document with readable text first.");

  const docs = fitDocuments(
    documents.map((d, i) => ({ id: d.id, ref: `D${i + 1}`, filename: d.filename, text: d.extracted_text ?? "" })),
    DOCUMENT_BUDGET,
  );
  const qs = questions.map((q, i) => ({ ...q, ref: `Q${i + 1}` }));

  const admin = createAdminClient();
  let runId: string;
  try {
    runId = await startRun(admin, { evaluationId: id, fundId: evaluation.fund_id, step: 1, userId: member.user.id });
  } catch (e) {
    return dbErrorResponse(e as { code?: string; message: string });
  }

  try {
    const { output } = await callLlm(
      P1A,
      {
        company: evaluation.company,
        questions: qs.map(({ ref, label, question }) => ({ ref, label, question })),
        documents: docs.map((d) => ({ ref: d.ref, filename: d.filename, text: d.shown, fullText: d.text, truncated: d.truncated })),
      },
      { fundId: evaluation.fund_id, model: evaluation.fund.llm_model, runId, evaluationId: id },
    );

    const byRef = new Map(output.answers.map((a) => [a.question, a]));
    const docId = new Map(docs.map((d) => [d.ref, d.id]));
    const drafts = qs.map((q) => {
      const a = byRef.get(q.ref)!;
      return {
        question_id: q.id,
        answer: a.found ? a.answer.trim() : NOT_STATED,
        found: a.found,
        citations: a.found ? a.citations.map((c) => ({ document_id: docId.get(c.document)!, excerpt: c.excerpt.trim() })) : [],
      };
    });

    const { error } = await admin.rpc("record_quick_screen_drafts", { p_evaluation_id: id, p_run_id: runId, p_drafts: drafts });
    if (error) {
      await failRun(admin, runId, error.message);
      return dbErrorResponse(error);
    }
    return Response.json({
      answers: Object.fromEntries(drafts.map((d) => [d.question_id, d.answer])),
      answered: drafts.filter((d) => d.found).length,
      notStated: drafts.filter((d) => !d.found).length,
      truncated: docs.filter((d) => d.truncated).map((d) => d.filename),
    });
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError("unavailable", "Something went wrong. Try again.");
    await failRun(admin, runId, err.detail ?? err.userMessage);
    return jsonError(err.kind === "missing_key" || err.kind === "auth" ? 503 : 502, err.userMessage);
  }
}
