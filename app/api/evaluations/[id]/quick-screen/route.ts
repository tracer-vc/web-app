import * as z from "zod";
import { dbErrorResponse, jsonError, memberContext } from "@/lib/api";
import { CriteriaNotes } from "@/lib/criteria";
import { MAX_ANSWER_LENGTH, QUICK_SCREEN_STATUSES } from "@/lib/evaluation-shared";
import { callLlm } from "@/lib/llm/call";
import { LlmError } from "@/lib/llm/client";
import { P1 } from "@/lib/llm/prompts/p1-quick-screen";
import { createAdminClient } from "@/lib/supabase/admin";

const AnswersBody = z.object({
  answers: z
    .array(
      z.object({
        question_id: z.uuid(),
        answer: z
          .string()
          .trim()
          .min(1, { error: "every question needs an answer" })
          .max(MAX_ANSWER_LENGTH, { error: `keep each answer to one or two sentences (max ${MAX_ANSWER_LENGTH} characters)` }),
      }),
    )
    .min(1),
});

// Step 1: store the answers, call P1, save the memo and set the status
// (passed | watch | collecting). Answers and memo are written together, so a
// failed call leaves nothing half-saved.
export async function POST(request: Request, ctx: RouteContext<"/api/evaluations/[id]/quick-screen">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  // Read through RLS: only members of the evaluation's fund get this far.
  const { data: evaluation } = await member.supabase
    .from("evaluations")
    .select(
      `id, fund_id, status, config_id,
       company:companies(name, stage, sector),
       config:framework_configs(classification_criteria),
       fund:funds(llm_model)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!evaluation) return jsonError(404, "Deal not found.");
  if (!QUICK_SCREEN_STATUSES.includes(evaluation.status)) {
    return jsonError(409, "The Quick Screen can only be redone before Evidence Collection starts.");
  }

  const parsed = AnswersBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message);

  const { data: questions } = await member.supabase
    .from("quick_screen_questions")
    .select("id, label, question")
    .eq("config_id", evaluation.config_id)
    .order("position");
  const byId = new Map(parsed.data.answers.map((a) => [a.question_id, a.answer]));
  if (!questions?.length || questions.some((q) => !byId.has(q.id)) || byId.size !== questions.length) {
    return jsonError(400, "Answer every Quick Screen question (and only those).");
  }

  const admin = createAdminClient();
  const { data: run, error: runError } = await admin
    .from("pipeline_runs")
    .insert({
      evaluation_id: id,
      fund_id: evaluation.fund_id,
      step: 1,
      status: "running",
      started_at: new Date().toISOString(),
      created_by: member.user.id,
    })
    .select("id")
    .single();
  if (runError) return dbErrorResponse(runError);

  const fail = async (message: string) => {
    await admin
      .from("pipeline_runs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  };

  try {
    const { output, llmCallId } = await callLlm(
      P1,
      {
        company: evaluation.company,
        criteria: CriteriaNotes.parse(evaluation.config.classification_criteria),
        answers: questions.map((q) => ({ label: q.label, question: q.question, answer: byId.get(q.id)! })),
      },
      { fundId: evaluation.fund_id, model: evaluation.fund.llm_model, runId: run.id, evaluationId: id },
    );

    const { error } = await admin.rpc("record_quick_screen", {
      p_evaluation_id: id,
      p_run_id: run.id,
      p_llm_call_id: llmCallId,
      p_answers: questions.map((q) => ({ question_id: q.id, answer: byId.get(q.id)! })),
      p_memo: output,
    });
    if (error) {
      await fail(error.message);
      return dbErrorResponse(error);
    }
    return Response.json({ verdict: output.verdict });
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError("unavailable", "Something went wrong. Try again.");
    await fail(err.detail ?? err.userMessage);
    return jsonError(err.kind === "missing_key" || err.kind === "auth" ? 503 : 502, err.userMessage);
  }
}

const OverrideBody = z.object({
  verdict: z.enum(["proceed", "watch", "pass"]),
  reason: z.string().trim().min(1, { error: "give a reason for the override" }).max(1000),
});

// Decision 13: the analyst may override the verdict. The database allows only
// this change, stamps who/when, moves the status and logs it (analyst_actions).
export async function PATCH(request: Request, ctx: RouteContext<"/api/evaluations/[id]/quick-screen">) {
  const member = await memberContext();
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const parsed = OverrideBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message);

  const { data, error } = await member.supabase
    .from("quick_screen_memos")
    .update({ verdict: parsed.data.verdict, override_reason: parsed.data.reason })
    .eq("evaluation_id", id)
    .select("verdict");
  if (error) return dbErrorResponse(error);
  if (!data.length) return jsonError(404, "No Quick Screen memo to override.");

  return Response.json({ verdict: data[0].verdict });
}
