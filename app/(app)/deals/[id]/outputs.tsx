"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CLAIM_TYPE_LABELS, CONFIDENCE_LABELS, type ClaimTableView } from "@/lib/claim-shared";
import { CONFLICT_STATUS_LABELS, CONFLICT_STATUS_SHORT, type ConflictView } from "@/lib/conflict-shared";
import type { CounterCaseView } from "@/lib/counter-case-shared";
import { effectiveScore, type DimensionsView } from "@/lib/dimension-shared";
import { CLASSIFICATION_LABELS, refCodes, type OutputsView, type Section, type StatementView } from "@/lib/output-shared";
import { isRunActive, TIER_LABELS, type RunView, type SourceView } from "@/lib/source-shared";
import { TraceDrawer } from "./counter-case-tab";

// Output documents (step 6): Thesis Card, Decision Snapshot and Evidence Pack,
// rendered from rows. Every ID is a link into the trace drawer.

export type DealHeader = { name: string; stage: string; sector: string; evaluator: string | null; configVersion: number };

export type TraceBundle = {
  claimTable: ClaimTableView;
  counterCase: CounterCaseView;
  dimensions: DimensionsView;
  sources: SourceView[];
  conflicts: ConflictView[];
};

type Doc = "thesis-card" | "decision-snapshot" | "evidence-pack";

export function OutputsTab({
  doc,
  evaluationId,
  header,
  outputs,
  bundle,
  canRun,
}: {
  doc: Doc;
  evaluationId: string;
  header: DealHeader;
  outputs: OutputsView;
  bundle: TraceBundle;
  canRun: boolean;
}) {
  const [trace, setTrace] = useState<string | null>(null);
  const ready = outputs.decision !== null;

  return (
    <div className="flex flex-col gap-6">
      {!ready ? (
        <GeneratePanel evaluationId={evaluationId} initialRun={outputs.run} canRun={canRun} />
      ) : doc === "thesis-card" ? (
        <ThesisCard header={header} outputs={outputs} bundle={bundle} onOpen={setTrace} />
      ) : doc === "decision-snapshot" ? (
        <DecisionSnapshot header={header} outputs={outputs} bundle={bundle} onOpen={setTrace} />
      ) : (
        <EvidencePack outputs={outputs} bundle={bundle} onOpen={setTrace} />
      )}
      {trace && (
        <OutputTrace
          key={trace}
          code={trace}
          evaluationId={evaluationId}
          bundle={bundle}
          onOpen={setTrace}
          onClose={() => setTrace(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generating (before outputs exist)
// ---------------------------------------------------------------------------

function GeneratePanel({ evaluationId, initialRun, canRun }: { evaluationId: string; initialRun: RunView | null; canRun: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<RunView | null>(initialRun);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = isRunActive(run);

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
      const res = await fetch(`/api/evaluations/${evaluationId}/synthesize`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start synthesis.");
        return;
      }
      setRun({ id: data.runId, status: "queued", progress: 0, error: null, warnings: [], notes: [] });
      router.refresh();
    });
  }

  return (
    <section className="card gap-3">
      <h2 className="text-[22px]">Outputs</h2>
      {!active && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={start} disabled={!canRun || pending}>
            {run?.status === "failed" ? "Try again" : "Generate outputs"}
          </button>
          <span className="text-muted text-[13px]">
            Thesis Card (P12) → classification by rule (R3) → Decision Snapshot (P13); every statement cites the tables.
          </span>
        </div>
      )}
      {active && run && (
        <div className="flex flex-col gap-1.5" data-testid="run-progress">
          <div className="text-[13px]">
            Step 6 · {run.status === "queued" ? "Waiting for the background worker…" : `Writing outputs · ${run.progress}%`}
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-[var(--color-neutral-900)]">
            <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.max(run.progress, 3)}%` }} />
          </div>
        </div>
      )}
      {run?.status === "failed" && (
        <p role="alert" className="text-danger text-[13px]" data-testid="run-result">
          Synthesis failed: {run.error ?? "unknown error"}. Try again.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Refs({ codes, onOpen }: { codes: string[]; onOpen: (code: string) => void }) {
  return (
    <>
      {codes.map((c) => (
        <button
          key={c}
          onClick={() => onOpen(c)}
          className="ml-1 font-mono text-[10.5px] text-[var(--color-accent-300)] hover:underline print:text-black"
          data-testid="ref-chip"
          data-code={c}
        >
          [{c}]
        </button>
      ))}
    </>
  );
}

function Statement({ s, onOpen, detailLabel }: { s: StatementView; onOpen: (code: string) => void; detailLabel?: string }) {
  return (
    <p className="leading-snug" data-testid="statement" data-section={s.section}>
      {s.text}
      {s.detail && detailLabel && (
        <>
          {" "}
          <span className="text-muted">{detailLabel}:</span> {s.detail}
        </>
      )}
      <Refs codes={refCodes(s.refs)} onOpen={onOpen} />
    </p>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-0.5 text-[10px] tracking-widest text-[var(--color-accent)] uppercase print:text-black">{title}</h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

const one = (o: OutputsView, s: Section) => o.statements[s]?.[0];
const many = (o: OutputsView, s: Section) => o.statements[s] ?? [];

function PrintButton() {
  return (
    <button className="btn ml-auto text-xs print:hidden" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}

function DocHeader({ title, header }: { title: string; header: DealHeader }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-[var(--color-divider)] pb-2">
      <div>
        <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase print:text-black">{title}</div>
        <h2 className="text-xl">{header.name}</h2>
        <p className="text-muted text-[11px]">
          Evaluator {header.evaluator ?? "—"} · Stage {header.stage || "—"} · Sector {header.sector || "—"} · Config v
          {header.configVersion}
        </p>
      </div>
      <PrintButton />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thesis Card (one printed page)
// ---------------------------------------------------------------------------

function ThesisCard({
  header,
  outputs,
  bundle,
  onOpen,
}: {
  header: DealHeader;
  outputs: OutputsView;
  bundle: TraceBundle;
  onOpen: (code: string) => void;
}) {
  const thesis = one(outputs, "thesis");
  const openQuestions = bundle.counterCase.uncertainties.filter((u) => u.decisionCritical && u.status === "open");
  return (
    <article
      className="card gap-3 p-6 text-[12.5px] print:gap-1.5 print:bg-white print:p-0 print:text-[8pt] print:leading-tight print:text-black"
      data-testid="thesis-card"
    >
      <DocHeader title="Thesis Card" header={header} />
      {thesis && (
        <div
          className="rounded-md bg-[var(--color-accent-800)]/30 p-3 text-[15px] leading-snug print:bg-transparent print:p-0 print:text-[10pt]"
          data-testid="thesis-hero"
        >
          <Statement s={thesis} onOpen={onOpen} />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2 print:gap-1.5">
        <Block title="Outlier scenario & mechanism">{one(outputs, "outlier") && <Statement s={one(outputs, "outlier")!} onOpen={onOpen} />}</Block>
        <Block title="Moat hypothesis">{one(outputs, "moat") && <Statement s={one(outputs, "moat")!} onOpen={onOpen} />}</Block>
        <Block title="Base case">{one(outputs, "base_case") && <Statement s={one(outputs, "base_case")!} onOpen={onOpen} detailLabel="Gating variables" />}</Block>
        <Block title="Upside case">{one(outputs, "upside_case") && <Statement s={one(outputs, "upside_case")!} onOpen={onOpen} detailLabel="Gating variables" />}</Block>
        <Block title="Failure case">
          {one(outputs, "failure_case") && <Statement s={one(outputs, "failure_case")!} onOpen={onOpen} detailLabel="Dominant failure mode" />}
        </Block>
        <Block title="Entry wedge">{one(outputs, "entry_wedge") && <Statement s={one(outputs, "entry_wedge")!} onOpen={onOpen} />}</Block>
        <Block title="De-risking milestones">
          <ol className="list-decimal pl-4">
            {many(outputs, "milestone").map((m) => (
              <li key={m.id}>
                <Statement s={m} onOpen={onOpen} />
              </li>
            ))}
          </ol>
        </Block>
        <Block title="Falsifiers">
          <ol className="list-decimal pl-4">
            {bundle.counterCase.falsifiers.map((f) => (
              <li key={f.id}>
                {f.criterion}
                <Refs codes={[f.code, ...f.claimCodes, ...f.uncertaintyCodes]} onOpen={onOpen} />
              </li>
            ))}
          </ol>
        </Block>
      </div>
      <Block title="Dimension scores">
        <table className="w-full text-left text-[12px] print:text-[8pt]">
          <tbody>
            {bundle.dimensions.assessments.map((a) => (
              <tr key={a.id} className="border-t border-[var(--color-divider)] align-top">
                <td className="w-44 py-1 pr-2">
                  {a.title}
                  <Refs codes={[a.code]} onOpen={onOpen} />
                </td>
                <td className="w-12 py-1 pr-2 tabular-nums">
                  {effectiveScore(a)}/5{a.cappedBy && "*"}
                  {a.override && "†"}
                </td>
                <td className="text-muted py-1">
                  <span className="line-clamp-2 print:line-clamp-1">{a.counterSignal}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bundle.dimensions.assessments.some((a) => a.cappedBy || a.override) && (
          <p className="text-muted text-[10px]">* capped by an open uncertainty · † overridden by the analyst</p>
        )}
      </Block>
      <Block title="Open questions">
        <ol className="list-decimal pl-4 print:columns-2 print:gap-6 [&>li]:break-inside-avoid">
          {openQuestions.map((u) => (
            <li key={u.id}>
              {u.question}
              <Refs codes={[u.code]} onOpen={onOpen} />
            </li>
          ))}
        </ol>
      </Block>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Decision Snapshot
// ---------------------------------------------------------------------------

function DecisionSnapshot({
  header,
  outputs,
  bundle,
  onOpen,
}: {
  header: DealHeader;
  outputs: OutputsView;
  bundle: TraceBundle;
  onOpen: (code: string) => void;
}) {
  const d = outputs.decision!;
  const justification = one(outputs, "justification");
  const trigger = one(outputs, "reeval_trigger");
  const open = bundle.conflicts.filter((c) => c.status === "open");
  return (
    <article className="card gap-4 p-6 text-[13px] print:bg-white print:p-0 print:text-black" data-testid="decision-snapshot">
      <DocHeader title="Decision Snapshot" header={header} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="tag tag-accent px-3 py-1 text-base" data-testid="classification">
          {CLASSIFICATION_LABELS[d.classification]}
        </span>
        <span className="text-muted text-xs">computed by rule (R3), not chosen by the model</span>
      </div>
      <p className="text-xs" data-testid="rule-applied">
        <span className="text-muted">Rule applied: </span>
        {d.ruleApplied}
      </p>
      {justification && (
        <Block title="Justification">
          <Statement s={justification} onOpen={onOpen} />
        </Block>
      )}
      <Block title="Three strongest supporting arguments">
        <ol className="list-decimal pl-4">
          {many(outputs, "supporting_arg").map((s) => (
            <li key={s.id}>
              <Statement s={s} onOpen={onOpen} />
            </li>
          ))}
        </ol>
      </Block>
      <Block title="Primary risks · the ranked counter-case">
        <ol className="list-decimal pl-4" data-testid="risks">
          {bundle.counterCase.arguments.map((a) => (
            <li key={a.id}>
              {a.argument}
              <Refs codes={a.claimCodes} onOpen={onOpen} />
            </li>
          ))}
        </ol>
      </Block>
      {open.length > 0 && (
        <Block title="Open conflicts">
          <ul data-testid="snapshot-open-conflicts">
            {open.map((c) => (
              <li key={c.id}>
                <button className="font-mono text-[11px] underline" onClick={() => onOpen(c.code)}>
                  {c.code}
                </button>{" "}
                {c.description} <span className="tag text-danger">open</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
      <Block title="Research agenda">
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-muted text-[11px]">
            <tr>
              <th className="py-1 pr-2 font-normal">Open question</th>
              <th className="py-1 pr-2 font-normal">Evidence that would resolve it</th>
              <th className="w-24 py-1 font-normal">IDs</th>
            </tr>
          </thead>
          <tbody>
            {many(outputs, "research_agenda").map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-divider)] align-top" data-testid="research-item">
                <td className="py-1 pr-2">{r.text}</td>
                <td className="text-muted py-1 pr-2">{r.detail}</td>
                <td className="py-1">
                  <Refs codes={refCodes(r.refs)} onOpen={onOpen} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>
      {trigger && (
        <Block title="Re-evaluation trigger">
          <Statement s={trigger} onOpen={onOpen} />
        </Block>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Evidence Pack: the five tables and the structural checks
// ---------------------------------------------------------------------------

function EvidencePack({ outputs, bundle, onOpen }: { outputs: OutputsView; bundle: TraceBundle; onOpen: (code: string) => void }) {
  const Code = ({ code }: { code: string }) => (
    <button className="font-mono text-[11px] text-[var(--color-accent-300)] underline" onClick={() => onOpen(code)} data-testid="pack-id" data-code={code}>
      {code}
    </button>
  );
  const { claims } = bundle.claimTable;
  return (
    <div className="flex flex-col gap-6" data-testid="evidence-pack">
      <section className="card gap-2 p-4" data-testid="structural-checks">
        <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">Structural checks</div>
        {outputs.checks.map((c) => (
          <div key={c.label} className="flex items-baseline gap-3 border-t border-[var(--color-divider)] pt-1.5 text-[13px]" data-testid="check" data-ok={String(c.ok)}>
            <span className="w-28 text-lg tabular-nums">{c.value}</span>
            <span className="flex-1">
              {c.label}
              <span className="text-muted block text-xs">{c.note}</span>
            </span>
            <span className={`tag ${c.ok === null ? "tag-neutral" : c.ok ? "tag-accent" : "text-danger"}`}>
              {c.ok === null ? "Info" : c.ok ? "Enforced" : "Violated"}
            </span>
          </div>
        ))}
      </section>

      <PackTable title="Source Table" count={bundle.sources.length} head={["ID", "Title", "Tier", "Party"]}>
        {bundle.sources.map((s) => (
          <tr key={s.id}>
            <td><Code code={s.code} /></td>
            <td>{s.title}</td>
            <td>{TIER_LABELS[s.tier]}</td>
            <td className="text-muted">{s.party}</td>
          </tr>
        ))}
      </PackTable>

      <PackTable title="Claim Table" count={claims.length} head={["ID", "Claim", "Type", "Conf.", "Sources"]}>
        {claims.map((c) => (
          <tr key={c.id}>
            <td><Code code={c.code} /></td>
            <td>
              {c.statement}
              {c.conflicts.map((x) => (
                <span key={x.id} className={`tag ml-1 ${x.status === "open" ? "text-danger" : "tag-neutral"}`}>
                  {x.code} · {CONFLICT_STATUS_SHORT[x.status]}
                </span>
              ))}
            </td>
            <td>{CLAIM_TYPE_LABELS[c.type]}</td>
            <td>{c.confidence ? CONFIDENCE_LABELS[c.confidence] : "—"}</td>
            <td className="font-mono text-[11px]">{c.links.map((l) => l.sourceCode).join(", ") || "—"}</td>
          </tr>
        ))}
      </PackTable>

      <PackTable title="Conflict Register" count={bundle.conflicts.length} head={["ID", "Kind", "Side A", "Side B", "Status"]}>
        {bundle.conflicts.map((c) => (
          <tr key={c.id} data-testid="pack-conflict" data-status={c.status}>
            <td><Code code={c.code} /></td>
            <td>{c.kind}</td>
            <td>
              <Code code={c.sideA.code} /> {c.sideA.text}
            </td>
            <td>
              <Code code={c.sideB.code} /> {c.sideB.text}
            </td>
            <td className={c.status === "open" ? "text-danger" : ""}>{CONFLICT_STATUS_LABELS[c.status]}</td>
          </tr>
        ))}
      </PackTable>

      <PackTable title="Uncertainty List" count={bundle.counterCase.uncertainties.length} head={["ID", "Open question", "Decision-critical", "Origin"]}>
        {bundle.counterCase.uncertainties.map((u) => (
          <tr key={u.id}>
            <td><Code code={u.code} /></td>
            <td>{u.question}</td>
            <td>{u.decisionCritical ? "Yes" : "No"}</td>
            <td className="text-muted">{u.origin}</td>
          </tr>
        ))}
      </PackTable>

      <PackTable title="Dimension Assessment" count={bundle.dimensions.assessments.length} head={["ID", "Dimension", "Score", "Cited claims"]}>
        {bundle.dimensions.assessments.map((a) => (
          <tr key={a.id}>
            <td><Code code={a.code} /></td>
            <td>{a.title}</td>
            <td className="tabular-nums">
              {effectiveScore(a)}/5{a.cappedBy ? ` (capped by ${a.cappedBy})` : ""}
              {a.override ? " (overridden)" : ""}
            </td>
            <td className="font-mono text-[11px]">{a.claimCodes.join(", ")}</td>
          </tr>
        ))}
      </PackTable>
    </div>
  );
}

function PackTable({ title, count, head, children }: { title: string; count: number; head: string[]; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-lg">
        {title} <span className="text-muted text-sm">· {count}</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12.5px] [&_td]:border-t [&_td]:border-[var(--color-divider)] [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top">
          <thead className="text-muted text-xs">
            <tr>
              {head.map((h) => (
                <th key={h} className="py-1 pr-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trace drawer for any ID in the outputs: C#, U#, F# reuse the step-4
// drawer; S#, D# and CR# get read-only views here.
// ---------------------------------------------------------------------------

function OutputTrace({
  code,
  evaluationId,
  bundle,
  onOpen,
  onClose,
}: {
  code: string;
  evaluationId: string;
  bundle: TraceBundle;
  onOpen: (code: string) => void;
  onClose: () => void;
}) {
  const kind = code.replace(/\d+$/, "");
  if (kind === "C" || kind === "U" || kind === "F") {
    return (
      <TraceDrawer
        code={code}
        evaluationId={evaluationId}
        view={bundle.counterCase}
        claimTable={bundle.claimTable}
        onOpen={onOpen}
        onClose={onClose}
      />
    );
  }
  return (
    <aside
      className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl print:hidden"
      data-testid={kind === "S" ? "source-drawer" : kind === "D" ? "dimension-drawer" : "conflict-drawer"}
    >
      <div className="flex items-start gap-3">
        <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
          {kind === "S" ? "Source" : kind === "D" ? "Dimension" : "Conflict"} {code}
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {kind === "S" && <SourceBody code={code} evaluationId={evaluationId} bundle={bundle} onOpen={onOpen} />}
      {kind === "D" && <DimensionBody code={code} bundle={bundle} onOpen={onOpen} />}
      {kind === "CR" && <ConflictBody code={code} bundle={bundle} onOpen={onOpen} />}
    </aside>
  );
}

function Chips({ codes, onOpen }: { codes: string[]; onOpen: (code: string) => void }) {
  if (!codes.length) return <span className="text-muted">None.</span>;
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

function SourceBody({ code, evaluationId, bundle, onOpen }: { code: string; evaluationId: string; bundle: TraceBundle; onOpen: (code: string) => void }) {
  const s = bundle.sources.find((x) => x.code === code);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!s) return;
    let cancelled = false;
    fetch(`/api/evaluations/${evaluationId}/sources/${s.id}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setText(d.text ?? d.error ?? ""))
      .catch(() => !cancelled && setText("Couldn't load the text."));
    return () => {
      cancelled = true;
    };
  }, [evaluationId, s]);
  if (!s) return <p className="text-muted">This ID is not in this deal.</p>;
  const citing = bundle.claimTable.claims.filter((c) => c.links.some((l) => l.sourceCode === code)).map((c) => c.code);
  return (
    <>
      <h3 className="text-lg leading-snug">{s.title}</h3>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="tag tag-neutral">{TIER_LABELS[s.tier]}</span>
        <span className="text-muted">party: {s.party}</span>
        <span className="text-muted">{s.origin === "upload" ? `Upload · ${s.filename}` : s.url}</span>
      </div>
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Claims citing it</div>
        <Chips codes={citing} onOpen={onOpen} />
      </div>
      <pre className="max-h-[50vh] overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-xs whitespace-pre-wrap">{text ?? "Loading…"}</pre>
    </>
  );
}

function DimensionBody({ code, bundle, onOpen }: { code: string; bundle: TraceBundle; onOpen: (code: string) => void }) {
  const a = bundle.dimensions.assessments.find((x) => x.code === code);
  if (!a) return <p className="text-muted">This ID is not in this deal.</p>;
  return (
    <>
      <div className="flex items-start gap-3">
        <div>
          <h3 className="text-lg leading-snug">{a.title}</h3>
          <p className="text-muted text-xs">{a.question}</p>
        </div>
        <span className="ml-auto text-3xl tabular-nums">{effectiveScore(a)}</span>
      </div>
      <p className="text-muted text-[13px]">{a.anchor}</p>
      {a.cappedBy && (
        <p className="text-xs">
          Model score {a.proposedScore}, capped to {a.score} by{" "}
          <button className="underline" onClick={() => onOpen(a.cappedBy!)}>
            {a.cappedBy}
          </button>
        </p>
      )}
      {a.override && <p className="text-xs">Overridden by the analyst to {a.override.score} (model score {a.score}).</p>}
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
    </>
  );
}

function ConflictBody({ code, bundle, onOpen }: { code: string; bundle: TraceBundle; onOpen: (code: string) => void }) {
  const c = bundle.conflicts.find((x) => x.code === code);
  if (!c) return <p className="text-muted">This ID is not in this deal.</p>;
  return (
    <>
      <h3 className="text-lg leading-snug">{c.description}</h3>
      <span className={`tag w-fit ${c.status === "open" ? "text-danger" : "tag-accent"}`}>{CONFLICT_STATUS_LABELS[c.status]}</span>
      {[c.sideA, c.sideB].map((side, i) => (
        <div key={side.id} className="rounded-md border border-[var(--color-divider)] p-3 text-[13px]">
          <div className="text-muted mb-1 text-xs">Side {i === 0 ? "A" : "B"}</div>
          <button className="font-mono text-[11px] underline" onClick={() => onOpen(side.code)}>
            {side.code}
          </button>{" "}
          {side.text}
          <div className="text-muted text-xs">“{side.passage}”</div>
        </div>
      ))}
      {c.rationale && (
        <div className="text-[13px]">
          <div className="text-muted mb-1 text-xs">Rationale</div>
          {c.rationale}
        </div>
      )}
    </>
  );
}
