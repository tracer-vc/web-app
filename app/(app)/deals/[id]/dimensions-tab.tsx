"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ClaimTableView } from "@/lib/claim-shared";
import type { CounterCaseView } from "@/lib/counter-case-shared";
import { effectiveScore, type DimensionAssessmentView, type DimensionsView } from "@/lib/dimension-shared";
import { isRunActive, type RunView } from "@/lib/source-shared";
import { TraceDrawer } from "./counter-case-tab";

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Step 5 (ui_design.html, Dimension Analysis): one row per dimension of the
// pinned config — prompts & answers citing C#, strongest counter-signal and
// the 0–5 score with its cap or override. Every ID opens its trace drawer.
export function DimensionsTab({
  evaluationId,
  canRun,
  view,
  counterCase,
  claimTable,
}: {
  evaluationId: string;
  canRun: boolean;
  view: DimensionsView;
  counterCase: CounterCaseView;
  claimTable: ClaimTableView;
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunView | null>(view.run);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = isRunActive(run);
  const { assessments } = view;
  const done = assessments.length > 0;
  const mean = done ? (assessments.reduce((s, a) => s + effectiveScore(a), 0) / assessments.length).toFixed(1) : null;

  useEffect(() => {
    if (!run || !isRunActive(run)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/runs/${run.id}`);
      if (!res.ok) return;
      const next: RunView = await res.json();
      setRun(next);
      if (!isRunActive(next)) router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [evaluationId, run, router]);

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/dimensions`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start dimension scoring.");
        return;
      }
      setRun({ id: data.runId, status: "queued", progress: 0, error: null, warnings: [], notes: [] });
      router.refresh();
    });
  }

  const Id = ({ code }: { code: string }) => (
    <button
      className="font-mono text-[11px] text-[var(--color-accent-300)] underline"
      onClick={() => setTrace(code)}
      data-testid="trace-id"
      data-code={code}
    >
      {code}
    </button>
  );
  const open = trace?.startsWith("D") ? assessments.find((a) => a.code === trace) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-[22px]">Dimension Analysis</h2>
        <p className="text-muted text-[13px]">
          {view.dimensionCount} fund-defined dimension{view.dimensionCount === 1 ? "" : "s"} · each score cites{" "}
          {view.range.min}–{view.range.max} claims · a required prompt left open caps the score at {view.scoreCap}
          {mean && (
            <>
              {" "}
              · Mean <span data-testid="dimension-mean">{mean}</span>
            </>
          )}
        </p>
      </div>

      {(!done || run) && (
        <section className="card gap-3">
          {!done && !active && (
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" onClick={start} disabled={!canRun || pending}>
                {run?.status === "failed" ? "Try again" : "Score dimensions"}
              </button>
              <span className="text-muted text-[13px]">Runs P11 once per dimension over the Claim Table.</span>
            </div>
          )}
          {active && run && (
            <div className="flex flex-col gap-1.5" data-testid="run-progress">
              <div className="text-[13px]">
                Step 5 · {run.status === "queued" ? "Waiting for the background worker…" : `Scoring dimensions · ${run.progress}%`}
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-[var(--color-neutral-900)]">
                <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.max(run.progress, 3)}%` }} />
              </div>
            </div>
          )}
          {run && !active && (
            <div className="flex flex-col gap-1 text-[13px]" data-testid="run-result">
              {run.status === "failed" ? (
                <p role="alert" className="text-danger">
                  Dimension scoring failed: {run.error ?? "unknown error"}. Try again.
                </p>
              ) : (
                <p>Dimensions scored{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
              )}
              {run.warnings.map((w) => (
                <p key={w} className="text-danger text-xs">
                  ⚠ {w}
                </p>
              ))}
              {run.notes.map((n) => (
                <p key={n} className="text-muted text-xs">
                  {n}
                </p>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-danger text-[13px]">
              {error}
            </p>
          )}
        </section>
      )}

      {done && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]" data-testid="dimension-table">
            <thead className="text-muted text-xs">
              <tr className="border-b border-[var(--color-divider)]">
                <th className="w-11 py-2 pr-3 font-normal">ID</th>
                <th className="w-48 py-2 pr-3 font-normal">Dimension</th>
                <th className="py-2 pr-3 font-normal">Prompts &amp; answers</th>
                <th className="w-56 py-2 pr-3 font-normal">Strongest counter signal</th>
                <th className="w-36 py-2 font-normal">Score</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-divider)] align-top" data-testid="dimension-row" data-code={a.code}>
                  <td className="py-2 pr-3">
                    <Id code={a.code} />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-muted text-xs">{a.question}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <ol className="flex flex-col gap-1.5">
                      {a.answers.map((x, i) => (
                        <li key={i}>
                          <div className="text-muted text-[11px]">{x.prompt}</div>
                          <div>
                            {x.answer}{" "}
                            {x.claimCodes.map((c) => (
                              <span key={c} className="mr-1">
                                <Id code={c} />
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </td>
                  <td className="text-muted py-2 pr-3 text-xs">{a.counterSignal}</td>
                  <td className="py-2">
                    <ScoreCell a={a} onOpen={setTrace} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <DimensionDrawer key={open.id} evaluationId={evaluationId} a={open} onOpen={setTrace} onClose={() => setTrace(null)} />}
      {trace && !trace.startsWith("D") && (
        <TraceDrawer
          key={trace}
          code={trace}
          evaluationId={evaluationId}
          view={counterCase}
          claimTable={claimTable}
          onOpen={setTrace}
          onClose={() => setTrace(null)}
        />
      )}
    </div>
  );
}

function ScoreCell({ a, onOpen }: { a: DimensionAssessmentView; onOpen: (code: string) => void }) {
  const shown = effectiveScore(a);
  const disqualifying = a.disqualifyingBelow !== null && shown < a.disqualifyingBelow;
  return (
    <div className="flex flex-col gap-1" data-testid="dimension-score">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl tabular-nums">{shown}</span>
        <span className="text-muted text-xs">/ 5</span>
        {disqualifying && <span className="tag text-danger">disqualifying</span>}
      </div>
      {a.cappedBy && (
        <div className="text-muted text-[11px]" data-testid="capped-note">
          capped by{" "}
          <button className="underline" onClick={() => onOpen(a.cappedBy!)}>
            {a.cappedBy}
          </button>{" "}
          (proposed {a.proposedScore})
        </div>
      )}
      {a.override && (
        <div className="text-[11px]" data-testid="override-note">
          Overridden by analyst · model score {a.score}
        </div>
      )}
    </div>
  );
}

function Chips({ codes, onOpen }: { codes: string[]; onOpen: (code: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <button key={c} className="tag tag-neutral" onClick={() => onOpen(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}

function DimensionDrawer({
  evaluationId,
  a,
  onOpen,
  onClose,
}: {
  evaluationId: string;
  a: DimensionAssessmentView;
  onOpen: (code: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [score, setScore] = useState<string>(a.override ? String(a.override.score) : "");
  const [reason, setReason] = useState(a.override?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(clear: boolean) {
    setError(null);
    setSaved(false);
    if (!clear && score === "") {
      setError("Choose a score.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/dimensions/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { override_score: null } : { override_score: Number(score), reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save the override.");
        return;
      }
      if (clear) {
        setScore("");
        setReason("");
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <aside
      className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl"
      data-testid="dimension-drawer"
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">Dimension {a.code}</div>
          <h3 className="text-lg leading-snug">{a.title}</h3>
          <p className="text-muted text-xs">{a.question}</p>
        </div>
        <span className="ml-auto text-3xl tabular-nums">{effectiveScore(a)}</span>
        <button className="btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="text-muted text-[13px]" data-testid="anchor-text">
        {a.anchor}
      </p>
      <div className="flex flex-col gap-1 text-xs">
        <div>
          Model score {a.proposedScore}
          {a.cappedBy ? (
            <>
              {" "}
              → capped to {a.score} by{" "}
              <button className="underline" onClick={() => onOpen(a.cappedBy!)}>
                {a.cappedBy}
              </button>{" "}
              (a required Collection Prompt has no answering claim)
            </>
          ) : null}
        </div>
        {a.override && (
          <div data-testid="override-meta">
            Overridden by {a.override.by ?? "a former member"} to {a.override.score}
            {a.override.at && <> · {fmtDateTime(a.override.at)}</>}
            {a.override.reason && <> · “{a.override.reason}”</>}
          </div>
        )}
      </div>

      {a.answers.map((x, i) => (
        <div key={i} className="text-[13px]">
          <div className="text-muted mb-1 text-xs">{x.prompt}</div>
          <div className="mb-1">{x.answer}</div>
          {x.claimCodes.length > 0 && <Chips codes={x.claimCodes} onOpen={onOpen} />}
        </div>
      ))}
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Strongest counter signal</div>
        {a.counterSignal}
      </div>
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Claims justifying the score</div>
        <Chips codes={a.claimCodes} onOpen={onOpen} />
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--color-divider)] pt-4 text-[13px]">
        <div className="text-muted text-xs">Override score (logged; the model score is kept)</div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-24" aria-label="Override score" value={score} onChange={(e) => setScore(e.target.value)}>
            <option value="">—</option>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            className="input min-w-0 flex-1"
            aria-label="Override reason"
            placeholder="Reason (optional)"
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={() => save(false)} disabled={pending}>
            {pending ? "Saving…" : "Override score"}
          </button>
          {a.override && (
            <button className="btn" onClick={() => save(true)} disabled={pending}>
              Clear override
            </button>
          )}
          {saved && <span>Saved and logged.</span>}
        </div>
        {error && (
          <p role="alert" className="text-danger text-xs">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
