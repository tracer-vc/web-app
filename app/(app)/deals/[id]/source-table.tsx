"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { TIER_LABELS, type SourceTableView, type SourceView, type Tier } from "@/lib/source-shared";

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

// Source Table (S#) with tier and coverage panels and a trace drawer (ui_design.html, Evidence Collection).
export function SourceTable({ evaluationId, table }: { evaluationId: string; table: SourceTableView }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { sources, prompts, conflicts } = table;
  const conflictsOf = (code: string) => conflicts.filter((c) => c.sideA === code || c.sideB === code);
  const open = sources.find((s) => s.id === openId) ?? null;

  const tierCounts = (["primary", "secondary", "tertiary"] as Tier[]).map((t) => ({
    tier: t,
    n: sources.filter((s) => s.tier === t).length,
  }));
  const coverage = prompts.map((p, i) => ({
    n: i + 1,
    question: p.question,
    required: p.required,
    by: sources.filter((s) => s.promptIds.includes(p.id)).map((s) => s.code),
  }));

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]" data-testid="source-table">
          <thead className="text-muted text-xs">
            <tr className="border-b border-[var(--color-divider)]">
              <th className="w-11 py-2 pr-3 font-normal">ID</th>
              <th className="py-2 pr-3 font-normal">Title</th>
              <th className="w-24 py-2 pr-3 font-normal">Tier</th>
              <th className="w-24 py-2 pr-3 font-normal">Accessed</th>
              <th className="py-2 pr-3 font-normal">Relevance note</th>
              <th className="w-14 py-2 font-normal">Claims</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className="cursor-pointer border-b border-[var(--color-divider)] hover:bg-[var(--color-surface)]"
                data-testid="source-row"
              >
                <td className="py-2 pr-3 font-mono text-[11px] text-[var(--color-neutral-300)]">{s.code}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium">
                    {s.title}
                    {conflictsOf(s.code).map((c) => (
                      <span key={c.id} className="tag text-danger" title={c.description} data-testid="conflict-badge">
                        {c.code}
                      </span>
                    ))}
                  </div>
                  <div className="text-muted max-w-[420px] truncate text-[11px]">
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
                <td className="text-muted py-2 pr-3 text-xs">{fmtDate(s.accessedAt)}</td>
                <td className="text-muted py-2 pr-3 text-xs">{s.relevanceNote}</td>
                <td className="text-muted py-2 tabular-nums" data-testid="source-claims">
                  {s.claimCount || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sources.length === 0 && <p className="text-muted mt-3 text-[13px]">No sources: no document was relevant.</p>}
      </div>

      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">Sources by tier</div>
          {tierCounts.map((t) => (
            <div key={t.tier} className="grid grid-cols-[80px_1fr_20px] items-center gap-2 py-1 text-xs">
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
          <p className="text-muted mt-1.5 text-[11px]">
            Tier fixes how much confidence a source can justify. Tier 1 means first-order, not correct.
          </p>
        </div>
        <div className="card p-4" data-testid="coverage-panel">
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
            Coverage of Collection Prompts
          </div>
          {coverage.map((c) => (
            <div key={c.n} className="flex items-baseline gap-2 border-b border-[var(--color-divider)] py-1 text-xs">
              <span className="text-muted w-4 tabular-nums">{c.n}</span>
              <span className="flex-1 leading-snug">{c.question}</span>
              <span className={`tag flex-none ${c.by.length ? "tag-neutral" : "text-danger"}`} data-testid="coverage-status">
                {c.by.length ? c.by.join(", ") : c.required ? "Uncovered → U#" : "Uncovered"}
              </span>
            </div>
          ))}
          <p className="text-muted mt-1.5 text-[11px]">
            Source-level coverage from classification. Uncovered required prompts are written to the Uncertainty List by
            the sufficiency rule once claims are extracted.
          </p>
        </div>
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
          <div className="text-[10px] tracking-widest text-[var(--color-accent)] uppercase">Source {source.code}</div>
          <h3 className="text-lg">{source.title}</h3>
          <p className="text-muted text-xs">
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
          <span className="text-muted text-xs">Tier</span>
          <select className="input" aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {(["primary", "secondary", "tertiary"] as Tier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs">Party (who authored it; decides independence)</span>
          <input className="input" aria-label="Party" value={party} onChange={(e) => setParty(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={pending || !changed || !party.trim()}>
          {pending ? "Saving…" : "Save tier and party"}
        </button>
        {saved && <span className="text-[13px]">Saved and logged.</span>}
        {error && (
          <span role="alert" className="text-danger text-[13px]">
            {error}
          </span>
        )}
      </div>

      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Relevance note</div>
        {source.relevanceNote}
      </div>
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Collection Prompts it informs</div>
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
      <div className="text-[13px]">
        <div className="text-muted mb-1 text-xs">Text</div>
        <pre className="max-h-[50vh] overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-xs whitespace-pre-wrap">
          {text ?? "Loading…"}
        </pre>
      </div>
    </aside>
  );
}
