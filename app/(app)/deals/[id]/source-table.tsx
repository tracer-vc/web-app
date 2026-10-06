"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LuArrowRight } from "react-icons/lu";
import { flashTo } from "./jump";
import { TIER_LABELS, type SourceTableView, type SourceView, type Tier } from "@/lib/source-shared";
import { conflictTagClass, ID_TAG_CLASS } from "./id-tag";

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

// Source Table (S#) with the coverage panel below it and a trace drawer (ui_design.html, Evidence Collection).
export function SourceTable({ evaluationId, table }: { evaluationId: string; table: SourceTableView }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { sources, prompts, conflicts } = table;
  const conflictsOf = (code: string) => conflicts.filter((c) => c.sideA === code || c.sideB === code);
  const open = sources.find((s) => s.id === openId) ?? null;

  const coverage = prompts.map((p, i) => ({
    n: i + 1,
    question: p.question,
    required: p.required,
    by: sources.filter((s) => s.promptIds.includes(p.id)).map((s) => s.code),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-body" data-testid="source-table">
          <thead className="text-muted text-meta">
            <tr className="border-b border-[var(--color-divider)]">
              <th className="w-11 py-2 pr-3 font-normal">ID</th>
              <th className="w-[30%] py-2 pr-3 font-normal">Title</th>
              <th className="w-24 py-2 pr-3 font-normal">Tier</th>
              <th className="w-24 py-2 pr-3 font-normal">Accessed</th>
              <th className="py-2 pr-8 font-normal">Relevance note</th>
              <th className="w-20 py-2 font-normal">Claims</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr
                key={s.id}
                id={`source-${s.code}`}
                onClick={() => setOpenId(s.id)}
                className="cursor-pointer border-b border-[var(--color-divider)] hover:bg-[var(--color-hover)]"
                data-testid="source-row"
              >
                <td className="py-2 pr-3">
                  {/* Opens the source drawer, like the row. */}
                  <button type="button" className={ID_TAG_CLASS} title={`Trace ${s.code}`}>
                    {s.code}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium">
                    {s.title}
                    {conflictsOf(s.code).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        title={`${c.description} (click to see it in the register)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          flashTo(`conflict-${c.code}`);
                        }}
                        className={`${conflictTagClass(c.status === "open")} font-normal`}
                        data-testid="conflict-badge"
                      >
                        {c.code}
                      </button>
                    ))}
                  </div>
                  <div className="text-muted mt-1 max-w-[420px] truncate text-meta">
                    {s.origin === "upload" ? (
                      `Upload · ${s.filename}`
                    ) : (
                      <>
                        Web ·{" "}
                        <a href={s.url ?? "#"} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          {s.url}
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <span className="tag tag-neutral" data-testid="source-tier">
                    {TIER_LABELS[s.tier]}
                  </span>
                </td>
                <td className="text-muted py-2 pr-3">{fmtDate(s.accessedAt)}</td>
                <td className="text-muted py-2 pr-8">{s.relevanceNote}</td>
                <td className="py-2 tabular-nums" data-testid="source-claims">
                  {s.claimCount ? (
                    <Link
                      href={`/deals/${evaluationId}?tab=claims&source=${s.code}`}
                      onClick={(e) => e.stopPropagation()}
                      title={`Show the ${s.claimCount} claim${s.claimCount === 1 ? "" : "s"} citing ${s.code}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-neutral-900)] px-2 py-0.5 text-meta font-medium text-[var(--color-neutral-300)] no-underline transition-colors hover:bg-[var(--color-accent-tint)] hover:text-[var(--color-accent-text)]"
                    >
                      {s.claimCount}
                      <LuArrowRight aria-hidden className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-muted text-meta">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sources.length === 0 && <p className="text-muted mt-3 text-body">No sources: no document was relevant.</p>}
      </div>

      <div className="card p-4" data-testid="coverage-panel">
        <div className="text-panel font-semibold">
          Coverage of Collection Prompts
        </div>
        {coverage.map((c) => (
          <div key={c.n} className="flex items-baseline gap-2 border-b border-[var(--color-divider)] py-1 text-meta">
            <span className="text-muted w-4 tabular-nums">{c.n}</span>
            <span className="flex-1 leading-snug">{c.question}</span>
            <span className={`tag flex-none ${c.by.length ? "tag-neutral" : "text-danger"}`} data-testid="coverage-status">
              {c.by.length ? c.by.join(", ") : c.required ? "Uncovered → U#" : "Uncovered"}
            </span>
          </div>
        ))}
        <p className="text-muted mt-1.5 text-meta">
          Source-level coverage from classification. Uncovered required prompts are written to the Uncertainty List by
          the sufficiency rule once claims are extracted.
        </p>
      </div>

      {open && (
        <TraceDrawer
          key={open.id}
          evaluationId={evaluationId}
          source={open}
          prompts={prompts}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

// Sources by tier: shown next to the Source Table run summary.
export function TierSummary({ sources }: { sources: SourceView[] }) {
  const tierCounts = (["primary", "secondary", "tertiary"] as Tier[]).map((t) => ({
    tier: t,
    n: sources.filter((s) => s.tier === t).length,
  }));
  return (
    <div className="card p-4">
      <div className="text-panel font-semibold">Sources by tier</div>
      {tierCounts.map((t) => (
        <div key={t.tier} className="grid grid-cols-[80px_1fr_20px] items-center gap-2 py-1 text-meta">
          <span>{TIER_LABELS[t.tier]}</span>
          <span className="h-1.5 overflow-hidden rounded bg-[var(--color-neutral-900)]">
            <span
              className="block h-full bg-[var(--color-accent-400)]"
              style={{ width: `${sources.length ? (t.n / sources.length) * 100 : 0}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{t.n}</span>
        </div>
      ))}
      <p className="text-muted mt-1.5 text-meta">
        Tier fixes how much confidence a source can justify. Tier 1 means first-order, not correct.
      </p>
    </div>
  );
}

function TraceDrawer({
  evaluationId,
  source,
  prompts,
  onClose,
}: {
  evaluationId: string;
  source: SourceView;
  prompts: SourceTableView["prompts"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>(source.tier);
  const [party, setParty] = useState(source.party);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = tier !== source.tier || party.trim() !== source.party;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/evaluations/${evaluationId}/sources/${source.id}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setText(d.text ?? d.error ?? ""))
      .catch(() => !cancelled && setText("Couldn't load the text."));
    return () => {
      cancelled = true;
    };
  }, [evaluationId, source.id]);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, party: party.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const informs = prompts.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => source.promptIds.includes(p.id));

  return (
    <aside
      className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl"
      data-testid="trace-drawer"
    >
      <div className="flex items-start gap-3">
        <div>
          <div className="mb-1.5 text-meta font-medium text-[var(--color-accent-text)]">Source {source.code}</div>
          <h3 className="text-section font-semibold">{source.title}</h3>
          <p className="text-muted text-meta">
            {source.origin === "upload" ? `Upload · ${source.filename}` : `Web · ${source.url}`} · published{" "}
            {fmtDate(source.publishedAt)} · accessed {fmtDate(source.accessedAt)}
          </p>
        </div>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted text-meta">Tier</span>
          <select className="input" aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {(["primary", "secondary", "tertiary"] as Tier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-meta">Party (who authored it; decides independence)</span>
          <input className="input" aria-label="Party" value={party} onChange={(e) => setParty(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending || !changed || !party.trim()}>
          {pending ? "Saving…" : "Save tier and party"}
        </button>
        {saved && <span className="text-body">Saved and logged.</span>}
        {error && (
          <span role="alert" className="text-danger text-body">
            {error}
          </span>
        )}
      </div>

      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Relevance note</div>
        {source.relevanceNote}
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Collection Prompts it informs</div>
        {informs.length ? (
          <ul className="flex flex-col gap-1">
            {informs.map((p) => (
              <li key={p.id}>
                <span className="text-muted tabular-nums">{p.n}.</span> {p.question}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">None.</span>
        )}
      </div>
      <div className="text-body">
        <div className="text-muted mb-1 text-meta">Text</div>
        <pre className="max-h-[50vh] overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-meta whitespace-pre-wrap">
          {text ?? "Loading…"}
        </pre>
      </div>
    </aside>
  );
}
