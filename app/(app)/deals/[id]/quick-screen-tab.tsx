"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  MAX_ANSWER_LENGTH,
  VERDICT_LABELS,
  type AnswerView,
  type DocumentView,
  type MemoView,
  type Verdict,
} from "@/lib/evaluation-shared";
import { MaterialsSection } from "./materials-section";

const NEXT_STEP: Record<Verdict, string> = {
  proceed: "Proceed to full evaluation: Evidence Collection builds the Source Table from these materials.",
  watch: "Pipeline paused until the gating variable resolves.",
  pass: "Assessment discontinued.",
};

export function QuickScreenTab({
  evaluationId,
  fundId,
  questions,
  answers: saved,
  documents,
  memo,
  editable,
}: {
  evaluationId: string;
  fundId: string;
  questions: { id: string; label: string; question: string }[];
  answers: Record<string, AnswerView>;
  documents: DocumentView[];
  memo: MemoView | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, saved[q.id]?.answer ?? ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafting, startDrafting] = useTransition();
  const [generating, startGenerating] = useTransition();
  const pending = drafting || generating;

  const readable = documents.filter((d) => d.status === "extracted").length;

  const readingImages = documents.some((d) => d.visualStatus === "pending" || d.visualStatus === "running");
  const allAnswered = questions.every((q) => answers[q.id]?.trim());
  const changed = questions.some((q) => (answers[q.id] ?? "").trim() !== (saved[q.id]?.answer ?? "").trim());
  const hasAnswers = questions.some((q) => saved[q.id] || answers[q.id]?.trim());

  function draft() {
    if (hasAnswers && !confirm("Replace the current answers with new drafts from the materials?")) return;
    setError(null);
    setNotice(null);
    startDrafting(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/quick-screen/draft`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't draft the answers. Try again.");
        return;
      }
      setAnswers(data.answers);
      setNotice(
        `Drafted ${data.answered} answer${data.answered === 1 ? "" : "s"} from the materials` +
          (data.notStated ? `; ${data.notStated} not stated in the materials` : "") +
          (data.truncated?.length ? `. Only the beginning of ${data.truncated.join(", ")} was read.` : ".") +
          " Review them, then generate the memo.",
      );
      router.refresh();
    });
  }

  function generate() {
    setError(null);
    setNotice(null);
    startGenerating(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/quick-screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((q) => ({ question_id: q.id, answer: (answers[q.id] ?? "").trim() })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't generate the memo. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <MaterialsSection evaluationId={evaluationId} fundId={fundId} documents={documents} editable={editable} />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <h2 className="mb-1 text-[22px]">Quick Screen</h2>
              <p className="text-muted text-[13px]">
                {questions.length} fund-defined question{questions.length === 1 ? "" : "s"} · 1–2 sentences each
              </p>
            </div>
            {editable && (
              <button
                className="btn btn-primary ml-auto"
                onClick={draft}
                disabled={pending || readable === 0 || readingImages}
                title={readable === 0 ? "Upload at least one document with readable text first" : undefined}
              >
                {drafting ? "Drafting answers…" : readingImages ? "Reading images…" : "Draft answers from materials"}
              </button>
            )}
          </div>
          {editable && readable === 0 && (
            <p className="text-muted text-[13px]">
              Upload materials and the AI drafts the answers from them, or type the answers yourself.
            </p>
          )}

          {questions.map((q, i) => (
            <AnswerCard
              key={q.id}
              index={i}
              question={q}
              value={answers[q.id] ?? ""}
              saved={saved[q.id]}
              readOnly={!editable || pending}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            />
          ))}

          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-primary"
                onClick={generate}
                disabled={pending || !allAnswered || (!!memo && !changed)}
              >
                {generating ? "Generating memo…" : memo ? "Regenerate memo" : "Generate memo"}
              </button>
              {!allAnswered && <span className="text-muted text-[13px]">Every question needs an answer.</span>}
              {memo && !changed && allAnswered && (
                <span className="text-muted text-[13px]">Change an answer to regenerate.</span>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="text-[13px]">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger text-[13px]">
              {error}
            </p>
          )}
        </section>

        <section>
          {memo ? (
            <MemoCard evaluationId={evaluationId} memo={memo} editable={editable} />
          ) : (
            <div className="card text-[13px]">
              <h2 className="text-lg">Quick Screen memo</h2>
              <p className="text-muted">
                Upload materials, draft and review the answers, then generate. The memo states a preliminary thesis, a
                Proceed / Watch / Pass verdict with one-sentence justification, and the two most decision-critical
                uncertainties. Only Proceed continues to Evidence Collection.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AnswerCard({
  index,
  question,
  value,
  saved,
  readOnly,
  onChange,
}: {
  index: number;
  question: { id: string; label: string; question: string };
  value: string;
  saved: AnswerView | undefined;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const ai = saved?.origin === "ai";
  const edited = ai && value.trim() !== (saved.aiAnswer ?? "").trim();
  const notFound = ai && saved.foundInMaterials === false && !edited;

  return (
    <div className="card gap-2 p-4" data-testid="answer-card">
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
        <span>
          <span className="text-muted tabular-nums">{index + 1}.</span> {question.label}
        </span>
        {ai && (
          <span className="tag tag-neutral ml-auto" data-testid="answer-badge">
            {notFound ? "not in materials" : edited ? "AI draft · edited" : "AI draft"}
          </span>
        )}
      </div>
      <span className="text-muted text-[13px]">{question.question}</span>
      <textarea
        className="input min-h-20"
        aria-label={question.label}
        maxLength={MAX_ANSWER_LENGTH}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
      {edited && saved.aiAnswer && (
        <p className="text-muted text-xs">AI draft: “{saved.aiAnswer}”</p>
      )}
      {saved?.citations.length ? (
        <details className="text-xs">
          <summary className="text-muted cursor-pointer">
            {saved.citations.length} excerpt{saved.citations.length === 1 ? "" : "s"} from the materials
          </summary>
          <ul className="mt-1 flex flex-col gap-1.5">
            {saved.citations.map((c, i) => (
              <li key={i} className="border-l-2 border-[var(--color-accent-800)] pl-2">
                “{c.excerpt}” <span className="text-muted">({c.filename})</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function MemoCard({ evaluationId, memo, editable }: { evaluationId: string; memo: MemoView; editable: boolean }) {
  const router = useRouter();
  const [overriding, setOverriding] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(memo.verdict);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveOverride() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/quick-screen`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save the override.");
        return;
      }
      setOverriding(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="card gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg">Quick Screen memo</h2>
        <span className="tag tag-neutral ml-auto" data-testid="memo-verdict">
          {VERDICT_LABELS[memo.verdict]}
        </span>
      </div>
      {memo.overridden && (
        <p className="text-[13px]">
          <span className="tag tag-neutral">overridden</span>{" "}
          <span className="text-muted">
            P1 said {VERDICT_LABELS[memo.originalVerdict]}; changed by {memo.overridden.by ?? "a fund member"} on{" "}
            {new Date(memo.overridden.at).toLocaleDateString("en-GB")}: “{memo.overridden.reason}”
          </span>
        </p>
      )}
      <Block title="Preliminary thesis">{memo.thesis}</Block>
      <Block title="Justification">{memo.justification}</Block>
      <Block title="Two most decision-critical uncertainties">
        <ol className="list-decimal pl-5">
          {memo.uncertainties.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ol>
      </Block>
      {memo.reopenCondition && <Block title="Reopen condition">{memo.reopenCondition}</Block>}
      {memo.gatingVariable && <Block title="Gating variable">{memo.gatingVariable}</Block>}
      {memo.reevalTrigger && <Block title="Re-evaluation trigger">{memo.reevalTrigger}</Block>}
      <Block title="Next step">{NEXT_STEP[memo.verdict]}</Block>

      <div className="flex flex-wrap items-center gap-2">
        {memo.verdict === "proceed" && (
          <Link href={`/deals/${evaluationId}?tab=evidence`} className="btn btn-primary no-underline">
            Continue to Evidence Collection
          </Link>
        )}
        {editable && !overriding && (
          <button className="btn" onClick={() => setOverriding(true)}>
            Edit verdict
          </button>
        )}
      </div>

      {overriding && (
        <div className="flex flex-col gap-2 border-t border-[var(--color-divider)] pt-3">
          <span className="text-muted text-xs">Override the verdict (logged)</span>
          <div className="flex gap-2">
            <select
              className="input w-36"
              aria-label="Verdict"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as Verdict)}
            >
              {(["proceed", "watch", "pass"] as const).map((v) => (
                <option key={v} value={v}>
                  {VERDICT_LABELS[v]}
                </option>
              ))}
            </select>
            <textarea
              className="input min-h-9 flex-1"
              aria-label="Reason for override"
              placeholder="Why you override the memo's verdict (required, written to the log)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={saveOverride}
              disabled={pending || verdict === memo.verdict || !reason.trim()}
            >
              {pending ? "Saving…" : "Save override"}
            </button>
            <button className="btn" onClick={() => setOverriding(false)} disabled={pending}>
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-danger text-[13px]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-[13.5px] leading-relaxed">
      <div className="text-muted mb-0.5 text-xs">{title}</div>
      <div>{children}</div>
    </div>
  );
}
