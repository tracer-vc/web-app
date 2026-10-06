import type { Metadata } from "next";
import Link from "next/link";
import { NavHighlight } from "@/app/motion";
import { requireUser } from "@/lib/auth";
import {
  PIPELINE_STEPS,
  VERDICT_LABELS,
  type DealRow,
  type Verdict,
} from "@/lib/evaluation-shared";
import { listDeals } from "@/lib/evaluations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Deals · Tracer",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "In evaluation" },
  { key: "decided", label: "Decided" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

// A deal is decided once the Quick Screen stopped it (Pass/Watch) or the outputs exist.
const isDecided = (d: DealRow) =>
  d.status === "complete" || d.status === "passed" || d.status === "watch";

// The verdict shown: R3 classification once outputs exist, else the Quick Screen verdict.
const shownVerdict = (d: DealRow): Verdict | null =>
  d.classification ?? d.verdict;

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  await requireUser();
  const deals = await listDeals(await createClient());

  const { view } = await searchParams;
  const filter: Filter = view === "active" || view === "decided" ? view : "all";
  const shown = deals.filter(
    (d) => filter === "all" || (filter === "decided") === isDecided(d),
  );

  const running = deals.filter((d) => d.running).length;
  const openConflicts = deals.reduce((n, d) => n + d.openConflicts, 0);
  const counts = {
    active: deals.filter((d) => !isDecided(d)).length,
    proceed: deals.filter((d) => shownVerdict(d) === "proceed").length,
    watch: deals.filter((d) => shownVerdict(d) === "watch").length,
    pass: deals.filter((d) => shownVerdict(d) === "pass").length,
  };

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="mb-1.5 text-page">Deals</h1>
          <p className="text-muted text-body">
            {plural(deals.length, "deal")}
            {running > 0 && <> · {plural(running, "run")} in progress</>}
            {openConflicts > 0 && (
              <> · {plural(openConflicts, "open conflict")}</>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {deals.length > 0 && (
            <nav className="seg" aria-label="Filter deals">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/deals" : `/deals?view=${f.key}`}
                  aria-current={filter === f.key ? "page" : undefined}
                  className="seg-opt"
                >
                  {filter === f.key && <NavHighlight id="deal-filter" />}
                  {f.label}
                </Link>
              ))}
            </nav>
          )}
          {deals.length > 0 && (
            <Link href="/deals/new" className="btn btn-primary no-underline">
              + New deal
            </Link>
          )}
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="panel flex flex-col items-center px-6 py-16 text-center">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="text-section mb-1.5 font-semibold">No deals yet</h2>
          <p className="text-muted mb-5 max-w-sm text-body">
            Create a deal, upload its materials and start with a Quick Screen
            against the fund&apos;s questions.
          </p>
          <Link href="/deals/new" className="btn btn-primary no-underline">
            + New deal
          </Link>
        </div>
      ) : (
        <>
          <dl
            className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
            data-testid="deal-stats"
          >
            <Stat label="In evaluation" value={counts.active} />
            <Stat
              label="Proceed"
              value={counts.proceed}
              dot="var(--color-accent)"
            />
            <Stat
              label="Watch"
              value={counts.watch}
              dot="var(--color-neutral-500)"
            />
            <Stat label="Pass" value={counts.pass} dot="var(--color-danger)" />
          </dl>

          <div className="panel overflow-x-auto">
            <table className="deals-table w-full min-w-[960px] text-left text-body">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Pipeline</th>
                  <th>Verdict</th>
                  <th>Conflicts</th>
                  <th title="Open decision-critical uncertainties">
                    Critical U
                  </th>
                  <th>Scores</th>
                  <th>Config</th>
                  <th className="text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <DealRowView key={d.id} deal={d} />
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-muted py-10 text-center">
                      No deals{" "}
                      {filter === "decided" ? "decided" : "in evaluation"} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function DealRowView({ deal: d }: { deal: DealRow }) {
  const verdict = shownVerdict(d);
  const stoppedEarly = d.status === "passed" || d.status === "watch";
  const current = PIPELINE_STEPS.find((s) => s.step === d.currentStep);

  return (
    <tr className="relative">
      <td>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-tint)] text-body font-medium text-[var(--color-accent-text)]">
            {initials(d.name)}
          </span>
          <div className="min-w-0">
            {/* The link covers the whole row. */}
            <Link
              href={`/deals/${d.id}`}
              className="deal-link text-reading font-medium after:absolute after:inset-0"
            >
              {d.name}
            </Link>
            <div className="text-muted truncate text-meta">
              {[d.stage, d.sector].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="flex items-center gap-[3px]" aria-hidden>
          {PIPELINE_STEPS.map((s) => {
            const done = d.status === "complete" || s.step < d.currentStep;
            const now = !done && s.step === d.currentStep && !stoppedEarly;
            return (
              <span
                key={s.key}
                title={s.label}
                className={`h-1.5 w-6 rounded-full ${now && d.running ? "animate-pulse" : ""}`}
                style={{
                  background: done
                    ? "var(--color-accent)"
                    : now
                      ? "var(--color-accent-chip)"
                      : "var(--color-neutral-800)",
                }}
              />
            );
          })}
        </div>
        <div className="text-muted mt-1.5 text-meta">
          {d.status === "complete"
            ? "Complete"
            : stoppedEarly
              ? "Stopped at Quick Screen"
              : d.status === "synthesizing"
                ? `Synthesis${d.running ? " · running" : ""}`
                : `${d.currentStep}/5 · ${current?.label ?? ""}${d.running ? " · running" : ""}`}
        </div>
      </td>
      <td>
        {verdict ? (
          <div>
            <span
              className={`tag ${verdict === "proceed" ? "tag-accent" : "tag-outline"} gap-1.5`}
              data-testid={d.classification ? "deal-classification" : undefined}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: VERDICT_DOT[verdict] }}
              />
              {VERDICT_LABELS[verdict]}
            </span>
            <div className="text-muted mt-1 text-meta">
              {d.classification
                ? "By rule (R3)"
                : d.overridden
                  ? "Quick Screen · overridden"
                  : "Quick Screen"}
            </div>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="tabular-nums" data-testid="deal-conflicts">
        {d.currentStep < 2 ? (
          <span className="text-muted">—</span>
        ) : d.openConflicts ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />
            {d.openConflicts} open
          </span>
        ) : (
          <span className="text-muted">None open</span>
        )}
      </td>
      <td className="tabular-nums" data-testid="deal-critical">
        {d.currentStep >= 3 ? (
          d.openCriticalUncertainties
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        {d.scores.length ? (
          <div
            className="flex items-end gap-[3px]"
            title={d.scores.map((s) => `${s.label}: ${s.score}/5`).join("\n")}
          >
            {d.scores.map((s, i) => (
              <span
                key={i}
                className="flex h-6 w-[7px] items-end rounded-[2px] bg-[var(--color-neutral-800)]"
              >
                <span
                  className="grow-y w-full rounded-[2px] bg-[var(--color-accent)]"
                  style={{ height: `${Math.max(s.score, 0.3) * 20}%` }}
                />
              </span>
            ))}
            <span className="text-muted ml-1.5 text-meta tabular-nums">
              Ø{" "}
              {(
                d.scores.reduce((n, s) => n + s.score, 0) / d.scores.length
              ).toFixed(1)}
            </span>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="text-muted tabular-nums">v{d.configVersion}</td>
      <td
        className="text-muted text-right whitespace-nowrap"
        title={new Date(d.updatedAt).toLocaleString("en-GB")}
      >
        {relativeDate(d.updatedAt)}
      </td>
    </tr>
  );
}

const VERDICT_DOT: Record<Verdict, string> = {
  proceed: "var(--color-accent)",
  watch: "var(--color-neutral-500)",
  pass: "var(--color-danger)",
};

function Stat({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot?: string;
}) {
  return (
    <div className="panel px-4 py-3">
      <dt className="text-muted flex items-center gap-1.5 text-meta">
        {dot && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: dot }}
          />
        )}
        {label}
      </dt>
      <dd className="m-0 mt-1 text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  ).toUpperCase();
}

function relativeDate(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
