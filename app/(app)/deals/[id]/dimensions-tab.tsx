"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Drawer } from "@/app/motion";
import type { ClaimTableView } from "@/lib/claim-shared";
import type { CounterCaseView } from "@/lib/counter-case-shared";
import { effectiveScore, type DimensionAssessmentView, type DimensionsView } from "@/lib/dimension-shared";
import { isRunActive, type RunView } from "@/lib/source-shared";
import { TraceDrawer } from "./counter-case-tab";
import { RerunControl, RunCallsLink } from "./rerun-control";
import { ContinueLink, NextIcon, StepBar } from "./step-bar";
import { ID_TAG_CLASS, tagClassFor } from "./id-tag";

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
  canSynthesize,
  synthesisStarted,
  hasOutputs,
}: {
  evaluationId: string;
  canRun: boolean;
  view: DimensionsView;
  counterCase: CounterCaseView;
  claimTable: ClaimTableView;
  canSynthesize: boolean;
  synthesisStarted: boolean;
  hasOutputs: boolean;
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

  // Step 6 starts from here; the output tabs show its progress.
  function synthesize() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/synthesize`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start synthesis.");
        return;
      }
      router.push(`/deals/${evaluationId}?tab=thesis-card`);
    });
  }

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
      className={`${ID_TAG_CLASS} align-[1px]`}
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
        <h2 className="mb-1 text-page">Dimension Analysis</h2>
        <p className="text-muted text-body">
          Each dimension is scored 0–5 and backed by {view.range.min}–{view.range.max} claims; an unanswered required
          question caps it at {view.scoreCap}.
          {mean && (
            <>
              {" "}
              Average score: <span data-testid="dimension-mean">{mean}</span>.
            </>
          )}
        </p>
      </div>

      {run && !active && (
        <section className="card gap-3">
          {run && !active && (
            <div className="flex flex-col gap-1 text-body" data-testid="run-result">
              {run.status === "failed" ? (
                <p role="alert" className="text-danger">
                  Dimension scoring failed: {(run.error ?? "unknown error").replace(/\.$/, "")}. Try again.
                </p>
              ) : (
                <p>Dimensions scored{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
              )}
              {run.warnings.map((w) => (
                <p key={w} className="text-danger text-meta">
                  ⚠ {w}
                </p>
              ))}
              {run.notes.map((n) => (
                <p key={n} className="text-muted text-meta">
                  {n}
                </p>
              ))}
              <RunCallsLink evaluationId={evaluationId} run={run} />
            </div>
          )}
          {error && !done && (
            <p role="alert" className="text-danger text-body">
              {error}
            </p>
          )}
        </section>
      )}

      {done && (
        <div className="panel overflow-x-auto">
          <table className="data-table w-full min-w-[900px] text-left text-body" data-testid="dimension-table">
            <thead>
              <tr>
                <th className="w-14">ID</th>
                <th className="w-52">Dimension</th>
                <th>Prompts &amp; answers</th>
                <th className="w-64">Strongest counter-signal</th>
                <th className="w-40">Score</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} data-testid="dimension-row" data-code={a.code}>
                  <td>
                    <Id code={a.code} />
                  </td>
                  <td>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-muted mt-1 text-meta leading-relaxed">{a.question}</div>
                  </td>
                  <td>
                    <ol className="flex flex-col divide-y divide-[var(--color-neutral-800)]">
                      {a.answers.map((x, i) => (
                        <li key={i} className="py-3 first:pt-0 last:pb-0">
                          <div className="mb-1 leading-snug font-medium">{x.prompt}</div>
                          <div className="leading-relaxed text-[var(--color-neutral-300)]">
                            {x.answer}
                            {x.claimCodes.map((c) => (
                              <span key={c} className="ml-1">
                                <Id code={c} />
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </td>
                  <td className="leading-relaxed text-[var(--color-neutral-300)]">{a.counterSignal}</td>
                  <td>
                    <ScoreCell a={a} onOpen={setTrace} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {done && !active && (
        <section className="flex flex-col gap-2">
          <div>
            <RerunControl
              evaluationId={evaluationId}
              step={5}
              label="dimension scoring"
              start={{ path: "dimensions", tab: "dimensions" }}
              hasOutputs={hasOutputs}
            />
          </div>
        </section>
      )}

      <StepBar
        error={error}
        step={5}
        title="Dimensions"
        done={done && !active}
        progress={active && run ? run.progress : undefined}
        status={
          active && run
            ? run.status === "queued"
              ? "Waiting for the background worker…"
              : `Scoring dimensions · ${run.progress}%`
            : done
              ? `${assessments.length} dimension${assessments.length === 1 ? "" : "s"} scored` +
                (synthesisStarted ? "" : " · review the scores, then generate the outputs")
              : run?.status === "failed"
                ? "The last run failed · try again"
                : "Score each fund-defined dimension 0–5 from the Claim Table"
        }
      >
        {!done && !active && (
          <button className="btn btn-primary" onClick={start} disabled={!canRun || pending}>
            {run?.status === "failed" ? "Try again" : "Score dimensions"}
          </button>
        )}
        {done &&
          !active &&
          (synthesisStarted ? (
            <ContinueLink href={`/deals/${evaluationId}?tab=thesis-card`} label="Open the Thesis Card" />
          ) : (
            <button className="btn btn-primary" onClick={synthesize} disabled={!canSynthesize || pending}>
              Generate outputs
              <NextIcon />
            </button>
          ))}
      </StepBar>

      <Drawer open={Boolean(open)}>
        {open && (
          <DimensionDrawer key={open.id} evaluationId={evaluationId} a={open} onOpen={setTrace} onClose={() => setTrace(null)} />
        )}
      </Drawer>
      <Drawer open={Boolean(trace && !trace.startsWith("D"))}>
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
      </Drawer>
    </div>
  );
}

function ScoreCell({ a, onOpen }: { a: DimensionAssessmentView; onOpen: (code: string) => void }) {
  const shown = effectiveScore(a);
  const disqualifying = a.disqualifyingBelow !== null && shown < a.disqualifyingBelow;
  return (
    <div className="flex flex-col gap-1" data-testid="dimension-score">
      <div className="flex items-center gap-2.5">
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`h-2 w-3.5 rounded-sm ${n <= shown ? "grow-x bg-[var(--color-accent)]" : "bg-[var(--color-neutral-800)]"}`}
              style={n <= shown ? { animationDelay: `${(n - 1) * 40}ms` } : undefined}
            />
          ))}
        </span>
        <span className="font-semibold tabular-nums">{shown}/5</span>
      </div>
      {disqualifying && <span className="tag text-danger w-fit">disqualifying</span>}
      {a.cappedBy && (
        <div className="text-muted text-meta" data-testid="capped-note">
          capped by{" "}
          <button className={`${ID_TAG_CLASS} align-[1px]`} onClick={() => onOpen(a.cappedBy!)}>
            {a.cappedBy}
          </button>{" "}
          (proposed {a.proposedScore})
        </div>
      )}
      {a.override && (
        <div className="text-muted text-meta" data-testid="override-note">
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
        <button key={c} type="button" className={tagClassFor(c)} onClick={() => onOpen(c)}>
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
    <div
      className="flex flex-col gap-4"
      data-testid="dimension-drawer"
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="mb-1.5 text-meta font-medium text-[var(--color-accent-text)]">Dimension {a.code}</div>
          <h3 className="text-section leading-snug">{a.title}</h3>
          <p className="text-muted text-meta">{a.question}</p>
        </div>
        <span className="ml-auto text-3xl tabular-nums">{effectiveScore(a)}</span>
        <button className="btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="text-muted text-body" data-testid="anchor-text">
        {a.anchor}
      </p>
      <div className="flex flex-col gap-1 text-meta">
        <div>
          Model score {a.proposedScore}
          {a.cappedBy ? (
            <>
              {" "}
              → capped to {a.score} by{" "}
              <button className={`${ID_TAG_CLASS} align-[1px]`} onClick={() => onOpen(a.cappedBy!)}>
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
        <div key={i} className="text-body">
          <div className="text-muted mb-1 text-meta">{x.prompt}</div>
          <div className="mb-1">{x.answer}</div>
          {x.claimCodes.length > 0 && <Chips codes={x.claimCodes} onOpen={onOpen} />}
        </div>
      ))}
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Strongest counter signal</div>
        {a.counterSignal}
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Claims justifying the score</div>
        <Chips codes={a.claimCodes} onOpen={onOpen} />
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--color-divider)] pt-4 text-body">
        <div className="text-muted text-meta">Override score (logged; the model score is kept)</div>
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
          <p role="alert" className="text-danger text-meta">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
