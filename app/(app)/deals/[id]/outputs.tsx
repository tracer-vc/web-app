"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  LuBan,
  LuChartBar,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleHelp,
  LuCircleMinus,
  LuDownload,
  LuInfo,
  LuLightbulb,
  LuListChecks,
  LuMilestone,
  LuMinus,
  LuPrinter,
  LuRefreshCw,
  LuRocket,
  LuSearch,
  LuShield,
  LuTarget,
  LuTrendingDown,
  LuTrendingUp,
  LuTriangleAlert,
} from "react-icons/lu";
import { CLAIM_TYPE_LABELS, CONFIDENCE_LABELS, type ClaimTableView } from "@/lib/claim-shared";
import { CONFLICT_STATUS_LABELS, CONFLICT_STATUS_SHORT, type ConflictView } from "@/lib/conflict-shared";
import type { CounterCaseView } from "@/lib/counter-case-shared";
import { effectiveScore, type DimensionsView } from "@/lib/dimension-shared";
import { CLASSIFICATION_LABELS, refCodes, type OutputsView, type Section, type StatementView } from "@/lib/output-shared";
import type { ClassificationTrace } from "@/lib/rules/classification";
import { isRunActive, TIER_LABELS, type RunView, type SourceView } from "@/lib/source-shared";
import { TraceDrawer } from "./counter-case-tab";
import { Hint } from "./hint";
import { RerunControl, RunCallsLink } from "./rerun-control";
import { conflictTagClass, ID_TAG_CLASS, TAG_SHAPE, tagClassFor } from "./id-tag";

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
    <div className="flex flex-col gap-6 print:gap-2">
      {ready && (
        <header className="flex flex-wrap items-start gap-4 print:hidden">
          <div className="min-w-0 flex-1 self-center">
            {outputs.run && <RunCallsLink evaluationId={evaluationId} run={outputs.run} />}
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {doc === "evidence-pack" ? (
              <a className="btn no-underline" href={`/api/evaluations/${evaluationId}/evidence-pack/xlsx`} data-testid="export-xlsx">
                <LuDownload aria-hidden className="h-4 w-4" />
                Export Evidence Pack (.xlsx)
              </a>
            ) : (
              <button className="btn" onClick={() => window.print()}>
                <LuPrinter aria-hidden className="h-4 w-4" />
                Print / save as PDF
              </button>
            )}
            <RerunControl
              evaluationId={evaluationId}
              step={6}
              label="outputs"
              action="Regenerate"
              start={{ path: "synthesize", tab: doc }}
              hasOutputs
              buttonClassName=""
            />
          </div>
        </header>
      )}
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
      <h2 className="text-panel font-semibold">Outputs</h2>
      {!active && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" onClick={start} disabled={!canRun || pending}>
            {run?.status === "failed" ? "Try again" : "Generate outputs"}
          </button>
          <span className="text-muted text-body">
            Thesis Card (P12) → classification by rule (R3) → Decision Snapshot (P13); every statement cites the tables.
          </span>
        </div>
      )}
      {active && run && (
        <div className="flex flex-col gap-1.5" data-testid="run-progress">
          <div className="text-body">
            Step 6 · {run.status === "queued" ? "Waiting for the background worker…" : `Writing outputs · ${run.progress}%`}
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-[var(--color-neutral-900)]">
            <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.max(run.progress, 3)}%` }} />
          </div>
        </div>
      )}
      {run?.status === "failed" && (
        <div className="flex flex-col gap-1" data-testid="run-result">
          <p role="alert" className="text-danger text-body">
            Synthesis failed: {(run.error ?? "unknown error").replace(/\.$/, "")}. Try again.
          </p>
          <RunCallsLink evaluationId={evaluationId} run={run} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger text-body">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces. On screen the documents are panels; in print (Print / save
// as PDF) the print: variants fold them back into a compact document.
// ---------------------------------------------------------------------------

function Refs({ codes, onOpen }: { codes: string[]; onOpen: (code: string) => void }) {
  return (
    <>
      {codes.map((c) => (
        <button
          key={c}
          onClick={() => onOpen(c)}
          className={`${ID_TAG_CLASS} ml-1 align-[1px] print:ml-0.5 print:h-auto print:bg-transparent print:p-0 print:align-baseline print:text-black`}
          data-testid="ref-chip"
          data-code={c}
        >
          <span className="hidden print:inline">[</span>
          {c}
          <span className="hidden print:inline">]</span>
        </button>
      ))}
    </>
  );
}

function Statement({ s, onOpen, detailLabel }: { s: StatementView; onOpen: (code: string) => void; detailLabel?: string }) {
  return (
    <p className="leading-relaxed print:leading-snug" data-testid="statement" data-section={s.section}>
      {s.text}
      {s.detail && detailLabel && (
        <span className="mt-3 block border-t border-[var(--color-neutral-800)] pt-3 text-body print:mt-0 print:inline print:border-0 print:p-0 print:text-[8pt]">
          <span className="mb-0.5 block text-meta font-medium text-[var(--color-neutral-400)] print:mb-0 print:inline print:text-[8pt] print:font-normal">
            {detailLabel}
            <span className="hidden print:inline">:</span>
          </span>{" "}
          {s.detail}
        </span>
      )}
      <Refs codes={refCodes(s.refs)} onOpen={onOpen} />
    </p>
  );
}

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean; style?: React.CSSProperties }>;

// What each Thesis Card section is (docs/app_summary.md, Thesis Card fields).
const SECTION_INFO = {
  thesis:
    "A one-sentence, testable explanation of why the company could become an outlier: the core value-creation mechanism and the conditions it needs.",
  outlier: "How large the outlier outcome could be over 5–10 years, and the mechanism that would produce it.",
  moat: "The claimed moat mechanism, why it should strengthen over time, and indicators that would show it working.",
  base_case:
    "The most plausible outcome, with the 1–3 gating variables: external conditions or dependencies that must resolve favorably.",
  upside_case: "The better-than-expected outcome, and the 1–3 gating variables it depends on.",
  failure_case:
    "How the thesis most likely fails, in line with the strongest counter-case, and the dominant failure mode behind it.",
  entry_wedge: "Who buys first and for which use case, through which sales motion or channel, and what triggers adoption.",
  milestones: "Two or three milestones that would materially reduce uncertainty, and the evidence that would prove each.",
  falsifiers: "Observable conditions, defined in advance, that would reject or materially revise the thesis if they occur.",
  dimensions:
    "Each fund-defined dimension scored 0–5 from its questions, citing 2–5 claims and naming the strongest counter-signal.",
  open_questions: "The decision-critical uncertainties that are still open, to resolve before the next decision.",
  // Decision Snapshot
  classification:
    "Proceed, Watch or Pass. Computed by code from the dimension scores and counts under the fund's criteria (R3); the model never chooses it.",
  rule_applied: "Which of the fund's Proceed / Watch / Pass criteria decided the classification, with the values that triggered it.",
  justification: "One or two sentences on why this classification fits the thesis, citing the claims behind it.",
  supporting: "The three strongest arguments for the outlier thesis, each citing the evidence behind it.",
  risks: "The counter-case: the strongest reasons the thesis might be wrong, ranked from most to least serious.",
  open_conflicts: "Contradictions between sources or claims that are not resolved yet. Both sides stay on record.",
  research_agenda: "What to find out next: each open question with the evidence that would resolve it.",
  reeval_trigger: "The event or evidence that should prompt a fresh look at this decision.",
  // Evidence Pack
  structural_checks:
    "Automatic checks that the outputs trace back to the tables: an ID on every statement, a verbatim excerpt on every Fact and Inference, a status on every conflict.",
  pack_sources: "Every source used (S#), tiered Primary, Secondary or Tertiary, with the party that published it.",
  pack_claims:
    "The atomic claims (C#) taken from the sources: Fact, Inference or Speculation. Facts and Inferences carry a verbatim excerpt; confidence is set by rule (R1).",
  pack_conflicts: "Contradictions between sources or claims (CR#). Both sides are kept, and every conflict carries a status.",
  pack_uncertainties: "Open questions (U#) the evidence does not answer yet, and whether each is decision-critical.",
  pack_dimensions: "The fund's dimensions (D#) scored 0–5, each citing the claims behind its score.",
} as const;

// A titled section: a white panel on screen, a plain block in print.
function Panel({
  title,
  icon: Icon,
  info,
  spacious = false,
  tone = "default",
  className = "",
  children,
  testId,
}: {
  title: string;
  icon?: IconType;
  info?: string;
  // More room under the title, for lists and tables (their numbers and
  // rows read as tighter than running text).
  spacious?: boolean;
  // "danger": tinted red panel for things that need attention (open conflicts).
  tone?: "default" | "danger";
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className={`panel break-inside-avoid p-5 print:rounded-none print:border-0 print:p-0 print:shadow-none ${
        tone === "danger"
          ? "rounded-xl border-[color-mix(in_srgb,var(--color-danger)_28%,white)] bg-[color-mix(in_srgb,var(--color-danger)_5%,white)] shadow-none print:bg-transparent"
          : ""
      } ${className}`}
      data-testid={testId}
    >
      <h3
        className={`${spacious ? "mb-4" : "mb-2.5"} text-panel flex items-center gap-2 font-semibold tracking-normal print:mb-0.5 print:text-[8pt] print:font-medium print:text-black`}
      >
        <Hint info={info}>
          {Icon && (
            <Icon
              aria-hidden
              className={`h-4 w-4 print:hidden ${tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-accent)]"}`}
            />
          )}
          {title}
        </Hint>
      </h3>
      <div className="flex flex-col gap-2 print:gap-1">{children}</div>
    </section>
  );
}

// Numbered list: number badges on screen, a plain decimal list in print.
function NumberedList({ items, testId }: { items: { key: string; content: React.ReactNode }[]; testId?: string }) {
  return (
    <ol className="flex flex-col gap-3 print:list-decimal print:gap-0 print:pl-4" data-testid={testId}>
      {items.map((item, i) => (
        <li key={item.key} className="flex gap-3 print:list-item">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-neutral-900)] text-meta font-medium text-[var(--color-neutral-300)] tabular-nums print:hidden">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 leading-relaxed print:leading-snug">{item.content}</div>
        </li>
      ))}
    </ol>
  );
}

const one = (o: OutputsView, s: Section) => o.statements[s]?.[0];
const many = (o: OutputsView, s: Section) => o.statements[s] ?? [];

// Document header, printed only (on screen the page header and sidebar say it).
function PrintHeader({ title, header }: { title: string; header: DealHeader }) {
  return (
    <div className="hidden border-b border-[var(--color-divider)] pb-2 print:block">
      <div className="text-meta font-medium">{title}</div>
      <h2 className="text-xl">{header.name}</h2>
      <p className="text-meta">
        Evaluator {header.evaluator ?? "—"} · Stage {header.stage || "—"} · Sector {header.sector || "—"} · Config v
        {header.configVersion}
      </p>
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
  const section = (s: Section, detailLabel?: string) => {
    const st = one(outputs, s);
    return st ? <Statement s={st} onOpen={onOpen} detailLabel={detailLabel} /> : <p className="text-muted">—</p>;
  };
  const span = "md:col-span-3 print:col-span-1";
  return (
    <article
      className="flex flex-col gap-4 text-reading print:gap-1.5 print:bg-white print:text-[8pt] print:leading-tight print:text-black"
      data-testid="thesis-card"
    >
      <PrintHeader title="Thesis Card" header={header} />
      {thesis && (
        <div
          className="rounded-xl border border-[var(--color-accent-chip)] bg-[var(--color-accent-tint)] px-6 py-5 print:rounded-none print:border-0 print:bg-transparent print:p-0"
          data-testid="thesis-hero"
        >
          <div className="mb-2 flex items-center text-meta font-semibold text-[var(--color-accent-text)] print:hidden">
            <Hint info={SECTION_INFO.thesis}>
              <LuLightbulb aria-hidden className="h-4 w-4" />
              Thesis
            </Hint>
          </div>
          <div className="text-[19px] leading-snug font-medium text-[var(--color-text)] print:text-[10pt] print:font-normal [&_p]:leading-snug">
            <Statement s={thesis} onOpen={onOpen} />
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-6 print:grid-cols-2 print:gap-1.5">
        <Panel title="Outlier scenario & mechanism" info={SECTION_INFO.outlier} icon={LuRocket} className={span}>
          {section("outlier")}
        </Panel>
        <Panel title="Moat hypothesis" info={SECTION_INFO.moat} icon={LuShield} className={span}>
          {section("moat")}
        </Panel>
        {/* Scenarios: one panel in three columns on screen; in print the
            wrappers dissolve (display: contents) into the two-column grid. */}
        <section className="panel md:col-span-6 print:contents">
          <div className="grid divide-y divide-[var(--color-neutral-800)] md:grid-cols-3 md:divide-x md:divide-y-0 print:contents">
            {(
              [
                ["base_case", "Base case", "Gating variables", LuMinus, "var(--color-neutral-500)"],
                ["upside_case", "Upside case", "Gating variables", LuTrendingUp, "var(--color-accent)"],
                ["failure_case", "Failure case", "Dominant failure mode", LuTrendingDown, "var(--color-danger)"],
              ] as const
            ).map(([key, title, detail, Icon, color]) => (
              <div key={key} className="break-inside-avoid p-5 print:p-0">
                <h3 className="mb-2.5 text-panel flex items-center gap-2 font-semibold tracking-normal print:mb-0.5 print:text-[8pt] print:font-medium print:text-black">
                  <Hint info={SECTION_INFO[key]}>
                    <Icon aria-hidden className="h-4 w-4 print:hidden" style={{ color }} />
                    {title}
                  </Hint>
                </h3>
                {section(key, detail)}
              </div>
            ))}
          </div>
        </section>
        <Panel title="Entry wedge" info={SECTION_INFO.entry_wedge} icon={LuTarget} className="md:col-span-6 print:col-span-1">
          {section("entry_wedge")}
        </Panel>
        <Panel title="De-risking milestones" info={SECTION_INFO.milestones} spacious icon={LuMilestone} className={span}>
          <NumberedList items={many(outputs, "milestone").map((m) => ({ key: m.id, content: <Statement s={m} onOpen={onOpen} /> }))} />
        </Panel>
        <Panel title="Falsifiers" info={SECTION_INFO.falsifiers} spacious icon={LuBan} className={span}>
          <NumberedList
            items={bundle.counterCase.falsifiers.map((f) => ({
              key: f.id,
              content: (
                <>
                  {f.criterion}
                  <Refs codes={[f.code, ...f.claimCodes, ...f.uncertaintyCodes]} onOpen={onOpen} />
                </>
              ),
            }))}
          />
        </Panel>
      </div>
      <Panel title="Dimension scores" info={SECTION_INFO.dimensions} spacious icon={LuChartBar}>
        <div className="flex flex-col divide-y divide-[var(--color-neutral-800)] print:divide-[var(--color-divider)]">
          {bundle.dimensions.assessments.map((a) => {
            const score = effectiveScore(a);
            return (
              <div
                key={a.id}
                className="grid items-start gap-x-5 gap-y-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[220px_150px_minmax(0,1fr)] print:grid-cols-[11rem_3rem_minmax(0,1fr)] print:py-1"
              >
                <div className="font-medium print:font-normal">
                  {a.title}
                  <Refs codes={[a.code]} onOpen={onOpen} />
                </div>
                <div className="flex items-center gap-2.5 md:min-h-[21px]">
                  <span className="flex gap-0.5 print:hidden" aria-hidden>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={`h-2 w-4 rounded-sm ${n <= score ? "bg-[var(--color-accent)]" : "bg-[var(--color-neutral-800)]"}`}
                      />
                    ))}
                  </span>
                  <span className="text-body font-medium tabular-nums print:text-[8pt] print:font-normal">
                    {score}/5{a.cappedBy && "*"}
                    {a.override && "†"}
                  </span>
                </div>
                <div className="text-muted text-body print:text-[8pt]">
                  <span className="line-clamp-3 print:line-clamp-1">{a.counterSignal}</span>
                </div>
              </div>
            );
          })}
        </div>
        {bundle.dimensions.assessments.some((a) => a.cappedBy || a.override) && (
          <p className="text-muted text-meta print:text-[7pt]">* capped by an open uncertainty · † overridden by the analyst</p>
        )}
      </Panel>
      <Panel title="Open questions" info={SECTION_INFO.open_questions} spacious icon={LuCircleHelp}>
        <div className="md:columns-2 md:gap-8 print:columns-2 print:gap-6 [&_li]:break-inside-avoid">
          <NumberedList
            items={openQuestions.map((u) => ({
              key: u.id,
              content: (
                <>
                  {u.question}
                  <Refs codes={[u.code]} onOpen={onOpen} />
                </>
              ),
            }))}
          />
        </div>
      </Panel>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Decision Snapshot
// ---------------------------------------------------------------------------

const VERDICT_COLOR: Record<keyof typeof CLASSIFICATION_LABELS, string> = {
  proceed: "var(--color-accent-text)",
  watch: "var(--color-text)",
  pass: "var(--color-danger)",
};

// The conditions that decided the classification, from the R3 trace: the
// fired rule's predicates, or for the Proceed fallback every Pass/Watch
// condition (none of which held).
function decidingConditions(trace: ClassificationTrace) {
  const fired = trace.rules.find((r) => r.matched);
  if (!fired || (fired.outcome === "proceed" && fired.predicates.length === 0)) {
    return trace.rules.filter((r) => r.outcome !== "proceed").flatMap((r) => r.predicates);
  }
  return fired.predicates;
}


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
    <article className="flex flex-col gap-4 text-reading print:gap-3 print:bg-white print:text-[13px] print:text-black" data-testid="decision-snapshot">
      <PrintHeader title="Decision Snapshot" header={header} />

      <section className="panel print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-6 pt-5 pb-5 print:p-0">
          <div>
            <div className="mb-1 text-body font-semibold print:hidden">
              <Hint info={SECTION_INFO.classification}>Classification</Hint>
            </div>
            <div
              className="text-[28px] leading-tight font-semibold tracking-tight print:text-base"
              style={{ color: VERDICT_COLOR[d.classification] }}
              data-testid="classification"
            >
              {CLASSIFICATION_LABELS[d.classification]}
            </div>
          </div>
          <p className="text-muted ml-auto pb-1 text-body print:ml-0 print:text-xs">Computed by rule (R3), not chosen by the model</p>
        </div>

        <div className="grid border-t border-[var(--color-neutral-800)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:divide-x md:divide-[var(--color-neutral-800)] print:mt-2 print:block print:border-0">
          <div className="p-6 print:p-0">
            <div className="mb-3 text-body font-semibold print:mb-0.5 print:text-xs print:text-black">
              <Hint info={SECTION_INFO.rule_applied}>Rule applied</Hint>
            </div>
            <ul className="flex flex-col gap-2 text-body print:hidden" aria-hidden>
              {decidingConditions(d.trace).map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  {p.result ? (
                    <LuCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                  ) : (
                    <LuCircleMinus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-neutral-600)]" />
                  )}
                  <span className={p.result ? "" : "text-muted"}>
                    {p.text}
                    {!p.result && " · not met"}
                  </span>
                </li>
              ))}
            </ul>
            {/* The rule as one sentence: for screen readers and print. */}
            <p className="sr-only text-body print:not-sr-only" data-testid="rule-applied">
              {d.ruleApplied}
            </p>
          </div>
          {justification && (
            <div className="p-6 print:mt-2 print:p-0">
              <div className="mb-3 text-body font-semibold print:mb-0.5 print:text-xs print:text-black">
                <Hint info={SECTION_INFO.justification}>Justification</Hint>
              </div>
              <Statement s={justification} onOpen={onOpen} />
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-1 print:gap-3">
        <Panel title="Three strongest supporting arguments" info={SECTION_INFO.supporting} spacious icon={LuCircleCheck}>
          <NumberedList items={many(outputs, "supporting_arg").map((s) => ({ key: s.id, content: <Statement s={s} onOpen={onOpen} /> }))} />
        </Panel>
        <Panel title="Primary risks · the ranked counter-case" info={SECTION_INFO.risks} spacious icon={LuTriangleAlert}>
          <NumberedList
            testId="risks"
            items={bundle.counterCase.arguments.map((a) => ({
              key: a.id,
              content: (
                <>
                  {a.argument}
                  <Refs codes={a.claimCodes} onOpen={onOpen} />
                </>
              ),
            }))}
          />
        </Panel>
      </div>

      {open.length > 0 && (
        <Panel title="Open conflicts" info={SECTION_INFO.open_conflicts} icon={LuCircleAlert} tone="danger">
          <ul className="flex flex-col gap-2" data-testid="snapshot-open-conflicts">
            {open.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5">
                <button
                  className={`${TAG_SHAPE} mt-0.5 border border-[color-mix(in_srgb,var(--color-danger)_22%,white)] bg-[var(--color-surface)] text-[var(--color-danger)] hover:border-[var(--color-danger)] print:h-auto print:border-0 print:bg-transparent print:p-0 print:text-black print:underline`}
                  onClick={() => onOpen(c.code)}
                >
                  {c.code}
                </button>
                <span className="flex-1">{c.description}</span>
                <span className="tag bg-[var(--color-surface)] text-danger shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-danger)_22%,white)]">
                  open
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Research agenda" info={SECTION_INFO.research_agenda} icon={LuSearch}>
        <div className="-mx-5 -mb-5 overflow-x-auto print:m-0">
          <table className="data-table w-full min-w-[560px] text-left text-body print:min-w-0 print:text-[12px]">
            <thead>
              <tr>
                <th>Open question</th>
                <th>Evidence that would resolve it</th>
                <th className="w-28">IDs</th>
              </tr>
            </thead>
            <tbody>
              {many(outputs, "research_agenda").map((r) => (
                <tr key={r.id} data-testid="research-item">
                  <td>{r.text}</td>
                  <td className="text-muted">{r.detail}</td>
                  <td>
                    <Refs codes={refCodes(r.refs)} onOpen={onOpen} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {trigger && (
        <Panel title="Re-evaluation trigger" info={SECTION_INFO.reeval_trigger} icon={LuRefreshCw}>
          <Statement s={trigger} onOpen={onOpen} />
        </Panel>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Evidence Pack: the five tables and the structural checks
// ---------------------------------------------------------------------------

function EvidencePack({ outputs, bundle, onOpen }: { outputs: OutputsView; bundle: TraceBundle; onOpen: (code: string) => void }) {
  const Code = ({ code }: { code: string }) => (
    <button
      className={ID_TAG_CLASS}
      onClick={() => onOpen(code)}
      data-testid="pack-id"
      data-code={code}
    >
      {code}
    </button>
  );
  const { claims } = bundle.claimTable;
  const tables = [
    { id: "pack-sources", title: "Source Table", count: bundle.sources.length },
    { id: "pack-claims", title: "Claim Table", count: claims.length },
    { id: "pack-conflicts", title: "Conflict Register", count: bundle.conflicts.length },
    { id: "pack-uncertainties", title: "Uncertainty List", count: bundle.counterCase.uncertainties.length },
    { id: "pack-dimensions", title: "Dimension Assessment", count: bundle.dimensions.assessments.length },
  ];
  return (
    <div className="flex flex-col gap-8" data-testid="evidence-pack">
      <section data-testid="structural-checks">
        <h2 className="text-section mb-3 flex items-center font-semibold">
          <Hint info={SECTION_INFO.structural_checks}>
            <LuListChecks aria-hidden className="h-5 w-5 text-[var(--color-accent)]" />
            Structural checks
          </Hint>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {outputs.checks.map((c) => (
            <div key={c.label} className="panel flex flex-col gap-1.5 p-4" data-testid="check" data-ok={String(c.ok)}>
              <div className="flex items-start gap-2">
                <span className="text-2xl font-medium tabular-nums">{c.value}</span>
                <span
                  className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium ${
                    c.ok === null
                      ? "bg-[var(--color-neutral-900)] text-[var(--color-neutral-300)]"
                      : c.ok
                        ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
                        : "bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] text-[var(--color-danger)]"
                  }`}
                >
                  {c.ok === null ? (
                    <LuInfo aria-hidden className="h-3 w-3" />
                  ) : c.ok ? (
                    <LuCircleCheck aria-hidden className="h-3 w-3" />
                  ) : (
                    <LuCircleAlert aria-hidden className="h-3 w-3" />
                  )}
                  {c.ok === null ? "Info" : c.ok ? "Enforced" : "Violated"}
                </span>
              </div>
              <div className="text-body font-medium">{c.label}</div>
              <div className="text-muted text-meta">{c.note}</div>
            </div>
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Evidence Pack tables">
        {tables.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neutral-800)] bg-[var(--color-surface)] px-3 py-1 text-body text-[var(--color-neutral-300)] no-underline hover:border-[var(--color-accent-chip)] hover:text-[var(--color-accent-text)]"
          >
            {t.title}
            <span className="text-muted text-meta tabular-nums">{t.count}</span>
          </a>
        ))}
      </nav>

      <PackTable id={tables[0].id} title="Source Table" info={SECTION_INFO.pack_sources} count={bundle.sources.length} head={["ID", "Title", "Tier", "Party"]}>
        {bundle.sources.map((s) => (
          <tr key={s.id}>
            <td><Code code={s.code} /></td>
            <td>{s.title}</td>
            <td>{TIER_LABELS[s.tier]}</td>
            <td className="text-muted">{s.party}</td>
          </tr>
        ))}
      </PackTable>

      <PackTable id={tables[1].id} title="Claim Table" info={SECTION_INFO.pack_claims} count={claims.length} head={["ID", "Claim", "Type", "Conf.", "Sources"]}>
        {claims.map((c) => (
          <tr key={c.id}>
            <td><Code code={c.code} /></td>
            <td>
              {c.statement}
              {c.conflicts.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={`${conflictTagClass(x.status === "open")} ml-1.5 gap-1 align-[1px]`}
                  title="Open the conflict"
                  onClick={() => onOpen(x.code)}
                  data-testid="pack-conflict-tag"
                >
                  {x.code}
                  <span className="font-sans">· {CONFLICT_STATUS_SHORT[x.status]}</span>
                </button>
              ))}
            </td>
            <td>{CLAIM_TYPE_LABELS[c.type]}</td>
            <td>{c.confidence ? CONFIDENCE_LABELS[c.confidence] : "—"}</td>
            <td>
              {c.links.length ? (
                <span className="flex flex-wrap gap-1">
                  {c.links.map((l) => (
                    <Code key={l.id} code={l.sourceCode} />
                  ))}
                </span>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </PackTable>

      <PackTable id={tables[2].id} title="Conflict Register" info={SECTION_INFO.pack_conflicts} count={bundle.conflicts.length} head={["ID", "Kind", "Side A", "Side B", "Status"]}>
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

      <PackTable
        id={tables[3].id}
        title="Uncertainty List" info={SECTION_INFO.pack_uncertainties}
        count={bundle.counterCase.uncertainties.length}
        head={["ID", "Open question", "Decision-critical", "Origin"]}
      >
        {bundle.counterCase.uncertainties.map((u) => (
          <tr key={u.id}>
            <td><Code code={u.code} /></td>
            <td>{u.question}</td>
            <td>{u.decisionCritical ? "Yes" : "No"}</td>
            <td className="text-muted">{u.origin}</td>
          </tr>
        ))}
      </PackTable>

      <PackTable
        id={tables[4].id}
        title="Dimension Assessment" info={SECTION_INFO.pack_dimensions}
        count={bundle.dimensions.assessments.length}
        head={["ID", "Dimension", "Score", "Cited claims"]}
      >
        {bundle.dimensions.assessments.map((a) => (
          <tr key={a.id}>
            <td><Code code={a.code} /></td>
            <td>{a.title}</td>
            <td className="tabular-nums">
              {effectiveScore(a)}/5{a.cappedBy ? ` (capped by ${a.cappedBy})` : ""}
              {a.override ? " (overridden)" : ""}
            </td>
            <td>
              <span className="flex flex-wrap gap-1">
                {a.claimCodes.map((c) => (
                  <Code key={c} code={c} />
                ))}
              </span>
            </td>
          </tr>
        ))}
      </PackTable>
    </div>
  );
}

function PackTable({
  id,
  title,
  info,
  count,
  head,
  children,
}: {
  id: string;
  title: string;
  info?: string;
  count: number;
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-section flex items-center gap-2 font-semibold">
        <Hint info={info}>{title}</Hint>
        <span className="rounded-full bg-[var(--color-neutral-900)] px-2 py-0.5 text-meta font-medium text-[var(--color-neutral-400)] tabular-nums">
          {count}
        </span>
      </h2>
      <div className="panel overflow-x-auto">
        <table className="data-table w-full min-w-[640px] text-left text-body">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
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
        <div className="mb-1.5 text-meta font-medium text-[var(--color-accent-text)]">
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
        <button key={c} type="button" className={tagClassFor(c)} onClick={() => onOpen(c)}>
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
      <h3 className="text-section leading-snug">{s.title}</h3>
      <div className="flex flex-wrap gap-2 text-meta">
        <span className="tag tag-neutral">{TIER_LABELS[s.tier]}</span>
        <span className="text-muted">party: {s.party}</span>
        <span className="text-muted">{s.origin === "upload" ? `Upload · ${s.filename}` : s.url}</span>
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Claims citing it</div>
        <Chips codes={citing} onOpen={onOpen} />
      </div>
      <pre className="max-h-[50vh] overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-meta whitespace-pre-wrap">{text ?? "Loading…"}</pre>
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
          <h3 className="text-section leading-snug">{a.title}</h3>
          <p className="text-muted text-meta">{a.question}</p>
        </div>
        <span className="ml-auto text-3xl tabular-nums">{effectiveScore(a)}</span>
      </div>
      <p className="text-muted text-body">{a.anchor}</p>
      {a.cappedBy && (
        <p className="text-meta">
          Model score {a.proposedScore}, capped to {a.score} by{" "}
          <button className={`${ID_TAG_CLASS} align-[1px]`} onClick={() => onOpen(a.cappedBy!)}>
            {a.cappedBy}
          </button>
        </p>
      )}
      {a.override && <p className="text-meta">Overridden by the analyst to {a.override.score} (model score {a.score}).</p>}
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
    </>
  );
}

function ConflictBody({ code, bundle, onOpen }: { code: string; bundle: TraceBundle; onOpen: (code: string) => void }) {
  const c = bundle.conflicts.find((x) => x.code === code);
  if (!c) return <p className="text-muted">This ID is not in this deal.</p>;
  return (
    <>
      <h3 className="text-section leading-snug">{c.description}</h3>
      <span className={`tag w-fit ${c.status === "open" ? "text-danger" : "tag-accent"}`}>{CONFLICT_STATUS_LABELS[c.status]}</span>
      {[c.sideA, c.sideB].map((side, i) => (
        <div key={side.id} className="rounded-md border border-[var(--color-divider)] p-3 text-body">
          <div className="text-muted mb-1 text-meta">Side {i === 0 ? "A" : "B"}</div>
          <button className={`${ID_TAG_CLASS} align-[1px]`} onClick={() => onOpen(side.code)}>
            {side.code}
          </button>{" "}
          {side.text}
          <div className="text-muted text-meta">“{side.passage}”</div>
        </div>
      ))}
      {c.rationale && (
        <div className="text-body">
          <div className="text-muted mb-1 text-meta">Rationale</div>
          {c.rationale}
        </div>
      )}
    </>
  );
}
