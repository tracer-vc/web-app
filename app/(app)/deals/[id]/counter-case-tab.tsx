"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ClaimTableView } from "@/lib/claim-shared";
import type { ConflictView } from "@/lib/conflict-shared";
import type { CounterCaseView, FalsifierView, UncertaintyListItem } from "@/lib/counter-case-shared";
import { isRunActive, type RunView } from "@/lib/source-shared";
import { ClaimDrawer } from "./claims-tab";
import { ConflictRegister } from "./conflict-register";
import { RerunControl, RunCallsLink } from "./rerun-control";
import { ContinueLink, NextIcon, StepBar } from "./step-bar";
import { ID_TAG_CLASS, tagClassFor } from "./id-tag";

// Step 4 (ui_design.html): Counter-Case (prompt → argument → mechanism → C#),
// Uncertainty List (U#) and Falsification Criteria (F#). Every ID opens its
// trace drawer.
export function CounterCaseTab({
  evaluationId,
  canRun,
  view,
  claimTable,
  conflicts,
  canScore,
  scoringStarted,
  hasOutputs,
}: {
  evaluationId: string;
  canRun: boolean;
  view: CounterCaseView;
  claimTable: ClaimTableView;
  conflicts: ConflictView[];
  canScore: boolean;
  scoringStarted: boolean;
  hasOutputs: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunView | null>(view.run);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = isRunActive(run);
  const done = view.arguments.length > 0;

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

  // Step 5 starts from here; the Dimensions tab shows its progress.
  function score() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/dimensions`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start dimension scoring.");
        return;
      }
      router.push(`/deals/${evaluationId}?tab=dimensions`);
    });
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/counter-case`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start the counter-case.");
        return;
      }
      setRun({ id: data.runId, status: "queued", progress: 0, error: null, warnings: [], notes: [] });
      router.refresh();
    });
  }

  const critical = view.uncertainties.filter((u) => u.decisionCritical).length;
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
  const Ids = ({ codes }: { codes: string[] }) =>
    codes.length ? (
      <span className="flex flex-wrap gap-1.5">
        {codes.map((c) => (
          <Id key={c} code={c} />
        ))}
      </span>
    ) : (
      <span className="text-muted">—</span>
    );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-page">Counter-Case</h2>
        <p className="text-muted text-body">
          The strongest arguments against this deal, what the sources can&apos;t answer, and what would prove the
          thesis wrong.
        </p>
      </div>

      {run && !active && (
        <section className="card gap-3">
          {run && !active && (
            <div className="flex flex-col gap-1 text-body" data-testid="run-result">
              {run.status === "failed" ? (
                <p role="alert" className="text-danger">
                  The counter-case run failed: {(run.error ?? "unknown error").replace(/\.$/, "")}. Try again.
                </p>
              ) : (
                <p>Counter-case built{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
              )}
              {run.warnings.map((w) => (
                <p key={w} className="text-danger text-meta" data-testid="run-warning">
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
        <section className="flex flex-col gap-3" data-testid="counter-arguments">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-section font-semibold">Three strongest arguments against</h3>
            <span className="text-muted text-meta">ranked · rank 1 sets the failure case</span>
          </div>
          {view.arguments.map((a) => (
            <article key={a.id} className="card gap-2 p-4 text-body" data-testid="counter-argument" data-rank={a.rank}>
              <div className="flex flex-wrap items-center gap-2 text-meta">
                <span className="tag tag-accent">#{a.rank}</span>
                <span className="text-muted">
                  {a.prompt ? `Counter-Case Prompt ${a.prompt.position}: ${a.prompt.text}` : "Not tied to one Counter-Case Prompt"}
                </span>
              </div>
              <p className="text-reading leading-snug">{a.argument}</p>
              <p>
                <span className="text-muted">Mechanism: </span>
                {a.mechanism}
              </p>
              <div className="flex items-center gap-2 text-meta">
                <span className="text-muted">Rests on</span>
                <Ids codes={a.claimCodes} />
              </div>
            </article>
          ))}
        </section>
      )}

      {done && (
        <section className="flex flex-col gap-3" data-testid="uncertainty-list">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-section font-semibold">Uncertainty List</h3>
            <span className="text-muted text-meta">
              {view.uncertainties.length} questions the sources cannot answer · {critical} decision-critical
            </span>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-body">
              <thead className="text-muted text-meta">
                <tr className="border-b border-[var(--color-divider)]">
                  <th className="w-11 py-2 pr-3 font-normal">ID</th>
                  <th className="py-2 pr-3 font-normal">Open question</th>
                  <th className="py-2 pr-3 font-normal">Why it remains unresolved</th>
                  <th className="w-28 py-2 pr-3 font-normal">Decision-critical</th>
                  <th className="w-32 py-2 pr-3 font-normal">Origin</th>
                  <th className="py-2 font-normal">Minimum evidence</th>
                </tr>
              </thead>
              <tbody>
                {view.uncertainties.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--color-divider)] align-top" data-testid="uncertainty-row">
                    <td className="py-2 pr-3">
                      <Id code={u.code} />
                    </td>
                    <td className="py-2 pr-3">{u.question}</td>
                    <td className="text-muted py-2 pr-3">{u.whyUnresolved}</td>
                    <td className="py-2 pr-3">
                      <span className={`tag ${u.decisionCritical ? "tag-accent" : "tag-neutral"}`} data-testid="critical-flag">
                        {u.decisionCritical ? "Decision-critical" : "Nice to know"}
                      </span>
                    </td>
                    <td className="text-muted py-2 pr-3" data-testid="uncertainty-origin">
                      {u.origin}
                    </td>
                    <td className="text-muted py-2">{u.minEvidence ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {done && (
        <section className="flex flex-col gap-3" data-testid="falsifiers">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-section font-semibold">Falsification Criteria</h3>
            <span className="text-muted text-meta">observable conditions that reject or revise the thesis</span>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-body">
              <thead className="text-muted text-meta">
                <tr className="border-b border-[var(--color-divider)]">
                  <th className="w-11 py-2 pr-3 font-normal">ID</th>
                  <th className="py-2 pr-3 font-normal">Criterion</th>
                  <th className="py-2 pr-3 font-normal">Outcome check</th>
                  <th className="w-44 py-2 font-normal">Links</th>
                </tr>
              </thead>
              <tbody>
                {view.falsifiers.map((f) => (
                  <tr key={f.id} className="border-b border-[var(--color-divider)] align-top" data-testid="falsifier-row">
                    <td className="py-2 pr-3">
                      <Id code={f.code} />
                    </td>
                    <td className="py-2 pr-3">{f.criterion}</td>
                    <td className="text-muted py-2 pr-3">{f.outcomeCheck}</td>
                    <td className="py-2">
                      <Ids codes={[...f.claimCodes, ...f.uncertaintyCodes]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {done && <ConflictRegister evaluationId={evaluationId} conflicts={conflicts} />}

      {done && !active && (
        <section className="flex flex-col gap-2">
          <div>
            <RerunControl
              evaluationId={evaluationId}
              step={4}
              label="counter-case"
              start={{ path: "counter-case", tab: "counter-case" }}
              hasOutputs={hasOutputs}
            />
          </div>
        </section>
      )}

      <StepBar
        error={error}
        step={4}
        title="Counter-Case"
        done={done && !active}
        progress={active && run ? run.progress : undefined}
        status={
          active && run
            ? run.status === "queued"
              ? "Waiting for the background worker…"
              : `Stress-testing the thesis · ${run.progress}%`
            : done
              ? `${view.arguments.length} counter-arguments · ${view.uncertainties.length} uncertainties · ${view.falsifiers.length} falsifiers` +
                (scoringStarted ? "" : " · then score the dimensions")
              : run?.status === "failed"
                ? "The last run failed · try again"
                : "Stress-test the thesis: the strongest arguments against, open uncertainties and falsifiers"
        }
      >
        {!done && !active && (
          <button className="btn btn-primary" onClick={start} disabled={!canRun || pending}>
            {run?.status === "failed" ? "Try again" : "Stress-test thesis"}
          </button>
        )}
        {done &&
          !active &&
          (scoringStarted ? (
            <ContinueLink href={`/deals/${evaluationId}?tab=dimensions`} label="Continue to Dimensions" />
          ) : (
            <button className="btn btn-primary" onClick={score} disabled={!canScore || pending}>
              Score dimensions
              <NextIcon />
            </button>
          ))}
      </StepBar>

      {trace && (
        <TraceDrawer
          key={trace}
          code={trace}
          evaluationId={evaluationId}
          view={view}
          claimTable={claimTable}
          onOpen={setTrace}
          onClose={() => setTrace(null)}
        />
      )}
    </div>
  );
}

export function TraceDrawer({
  code,
  evaluationId,
  view,
  claimTable,
  onOpen,
  onClose,
}: {
  code: string;
  evaluationId: string;
  view: CounterCaseView;
  claimTable: ClaimTableView;
  onOpen: (code: string) => void;
  onClose: () => void;
}) {
  if (code.startsWith("C")) {
    const claim = claimTable.claims.find((c) => c.code === code);
    if (claim) {
      return <ClaimDrawer evaluationId={evaluationId} claim={claim} prompts={claimTable.prompts} onOpen={onOpen} onClose={onClose} />;
    }
  }
  const u = code.startsWith("U") ? view.uncertainties.find((x) => x.code === code) : undefined;
  const f = code.startsWith("F") ? view.falsifiers.find((x) => x.code === code) : undefined;
  return (
    <aside
      className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl"
      data-testid={u ? "uncertainty-drawer" : f ? "falsifier-drawer" : "trace-drawer"}
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="mb-1.5 text-meta font-medium text-[var(--color-accent-text)]">
            {u ? "Uncertainty" : f ? "Falsifier" : "Not found"} {code}
          </div>
          <h3 className="text-section leading-snug">{u?.question ?? f?.criterion ?? "This ID is not in this deal."}</h3>
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {u && <UncertaintyBody u={u} onOpen={onOpen} />}
      {f && <FalsifierBody f={f} onOpen={onOpen} />}
    </aside>
  );
}

function Chips({ codes, onOpen }: { codes: string[]; onOpen: (code: string) => void }) {
  if (!codes.length) return <span className="text-muted">None.</span>;
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

function UncertaintyBody({ u, onOpen }: { u: UncertaintyListItem; onOpen: (code: string) => void }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 text-meta">
        <span className={`tag ${u.decisionCritical ? "tag-accent" : "tag-neutral"}`}>
          {u.decisionCritical ? "Decision-critical" : "Nice to know"}
        </span>
        <span className="tag tag-outline">{u.origin}</span>
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Why unresolved</div>
        {u.whyUnresolved}
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Minimum evidence check</div>
        {u.minEvidence ?? <span className="text-muted">Not stated.</span>}
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Tested by falsifiers</div>
        <Chips codes={u.falsifierCodes} onOpen={onOpen} />
      </div>
    </>
  );
}

function FalsifierBody({ f, onOpen }: { f: FalsifierView; onOpen: (code: string) => void }) {
  return (
    <>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Outcome check</div>
        {f.outcomeCheck}
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Claims it tests</div>
        <Chips codes={f.claimCodes} onOpen={onOpen} />
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Uncertainties it tests</div>
        <Chips codes={f.uncertaintyCodes} onOpen={onOpen} />
      </div>
    </>
  );
}
