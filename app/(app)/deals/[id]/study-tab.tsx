"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { STATUS_LABELS, VERDICT_LABELS } from "@/lib/evaluation-shared";
import { citedText, type Block, type RunDoc } from "@/lib/run-doc";
import type { StudyView } from "@/lib/study";

const FORMATS = [
  { value: "pdf", label: "PDF + Evidence Pack (.xlsx)" },
  { value: "html", label: "HTML + Evidence Pack (.xlsx)" },
  { value: "md", label: "Markdown" },
] as const;

const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Study 2 (decision 44, fund admins only): artifact runs (this deal plus hidden
// copies, each through steps 2b–6) and baseline memos on the same corpus and
// config, with an export for reviewers.
export function StudyTab({
  evaluationId,
  study,
  baselineDocs,
}: {
  evaluationId: string;
  study: StudyView;
  baselineDocs: Record<string, RunDoc>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<(typeof FORMATS)[number]["value"]>("pdf");
  const [pending, startTransition] = useTransition();
  const busy =
    study.baselines.some((b) => b.status === "queued" || b.status === "running") ||
    study.copies.some((c) => c.classification === null && c.lastRun?.status !== "failed");

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [busy, router]);

  function post(path: string, fallback: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/study/${path}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? fallback);
        return;
      }
      router.refresh();
    });
  }

  const runStatus = (c: StudyView["copies"][number]) =>
    c.classification
      ? "Complete"
      : c.lastRun?.status === "failed"
        ? `Failed at step ${c.lastRun.step}: ${c.lastRun.error ?? "unknown error"}`
        : `${STATUS_LABELS[c.status]} (step ${c.currentStep})`;

  return (
    <div className="flex flex-col gap-6" data-testid="study-tab">
      <div>
        <h2 className="mb-1 text-[22px]">Study 2</h2>
        <p className="text-muted text-[13px]">
          Artifact runs repeat steps 2b–6 on hidden copies of this deal (same documents, Quick Screen and config version).
          Baseline memos use the same LLM, Source Table texts and fund config, without the claim layer, sufficiency rule or
          conflict register. Visible to fund admins only.
        </p>
      </div>

      <section className="card gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg">Artifact runs</h3>
          <button className="btn btn-primary ml-auto text-xs" onClick={() => post("artifact", "Couldn't start the artifact run.")} disabled={pending}>
            Run artifact again
          </button>
        </div>
        <table className="w-full text-left text-[13px]" data-testid="artifact-runs">
          <thead className="text-muted text-xs">
            <tr>
              <th className="py-1 pr-3 font-normal">Run</th>
              <th className="py-1 pr-3 font-normal">Status</th>
              <th className="py-1 pr-3 font-normal">Classification</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--color-divider)]" data-testid="artifact-run" data-run="1">
              <td className="py-1.5 pr-3">1 · this deal</td>
              <td className="py-1.5 pr-3">{study.original.classification ? "Complete" : STATUS_LABELS[study.original.status]}</td>
              <td className="py-1.5 pr-3">{study.original.classification ? VERDICT_LABELS[study.original.classification] : "—"}</td>
              <td className="py-1.5">
                <Link href={`/deals/${evaluationId}?tab=thesis-card`}>Open</Link>
              </td>
            </tr>
            {study.copies.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-divider)]" data-testid="artifact-run" data-run={c.run} data-complete={c.classification !== null}>
                <td className="py-1.5 pr-3">{c.run} · copy</td>
                <td className={`py-1.5 pr-3 ${c.lastRun?.status === "failed" ? "text-danger" : ""}`}>{runStatus(c)}</td>
                <td className="py-1.5 pr-3">{c.classification ? VERDICT_LABELS[c.classification] : "—"}</td>
                <td className="py-1.5">
                  <Link href={`/deals/${c.id}?tab=${c.classification ? "thesis-card" : "evidence"}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg">Baseline memos</h3>
          <button
            className="btn btn-primary ml-auto text-xs"
            onClick={() => post("baseline", "Couldn't start the baseline.")}
            disabled={pending || !study.original.hasSources}
            title={study.original.hasSources ? undefined : "The baseline reads the Source Table; build it first."}
          >
            Run baseline
          </button>
        </div>
        {study.baselines.length === 0 && <p className="text-muted text-[13px]">No baseline memo yet.</p>}
        {study.baselines.map((b) => (
          <details key={b.id} className="border-t border-[var(--color-divider)] pt-2 text-[13px]" data-testid="baseline-run" data-status={b.status}>
            <summary className="cursor-pointer">
              Baseline run {b.run} · {b.status}
              {b.recommendation && ` · ${VERDICT_LABELS[b.recommendation]}`} · {fmt(b.createdAt)}
              {b.error && <span className="text-danger"> · {b.error}</span>}
            </summary>
            {baselineDocs[b.id] && <BlockView blocks={baselineDocs[b.id].blocks.slice(2)} />}
          </details>
        ))}
      </section>

      <section className="card gap-3" data-testid="study-export">
        <h3 className="text-lg">Export for reviewers</h3>
        <p className="text-muted text-[13px]">One file per completed run, zipped with a README; readable without the app.</p>
        <div className="flex flex-wrap gap-4 text-[13px]">
          {FORMATS.map((f) => (
            <label key={f.value} className="flex items-center gap-2">
              <input type="radio" name="format" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} />
              {f.label}
            </label>
          ))}
        </div>
        <a className="btn btn-primary w-fit no-underline" href={`/api/evaluations/${evaluationId}/study/export?format=${format}`} data-testid="study-export-link">
          Export all runs
        </a>
      </section>

      {error && (
        <p role="alert" className="text-danger text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}

function BlockView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1":
          case "h2":
            return (
              <h4 key={i} className="mt-3 text-base">
                {b.text}
              </h4>
            );
          case "h3":
            return (
              <div key={i} className="mt-2 text-[10px] tracking-widest text-[var(--color-accent)] uppercase">
                {b.text}
              </div>
            );
          case "meta":
            return (
              <p key={i} className="text-muted text-xs">
                {b.text}
              </p>
            );
          case "p":
            return <p key={i}>{citedText(b.item)}</p>;
          case "list":
            return (
              <ol key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} pl-5`}>
                {b.items.map((it, k) => (
                  <li key={k}>{citedText(it)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <table key={i} className="w-full text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    {b.head.map((h) => (
                      <th key={h} className="py-1 pr-2 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, k) => (
                    <tr key={k} className="border-t border-[var(--color-divider)] align-top">
                      {r.map((c, j) => (
                        <td key={j} className="py-1 pr-2">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
        }
      })}
    </div>
  );
}
