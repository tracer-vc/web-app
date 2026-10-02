"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { DocumentView } from "@/lib/evaluation-shared";
import { isRunActive, type RunView, type SourceTableView } from "@/lib/source-shared";
import { MaterialsSection } from "./materials-section";
import { SourceTable } from "./source-table";

// Step 2: the deal's materials (shared with the Quick Screen, decision 34),
// the uploads-only switch (decision 28) and the Source Table (2b).
export function EvidenceTab({
  evaluationId,
  fundId,
  documents,
  uploadsOnly,
  canBuild,
  claimsStarted,
  materialsEditable,
  table,
}: {
  evaluationId: string;
  fundId: string;
  documents: DocumentView[];
  uploadsOnly: boolean;
  canBuild: boolean;
  claimsStarted: boolean;
  materialsEditable: boolean;
  table: SourceTableView;
}) {
  const router = useRouter();
  const [value, setValue] = useState(uploadsOnly);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(table.run);
  const [pending, startTransition] = useTransition();
  const readable = documents.filter((d) => d.status === "extracted").length;
  const active = isRunActive(run);
  const built = table.sources.length > 0 || (!!run && !active && run.status !== "failed");

  // Poll the run while it is active (data_flow.html: polling fallback to Realtime).
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

  function toggle(next: boolean) {
    setError(null);
    setValue(next);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploads_only: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setValue(!next);
        setError(data?.error ?? "Couldn't change the setting.");
        return;
      }
      router.refresh();
    });
  }

  // Step 3 starts from here; the Claims tab shows its progress.
  function extract() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/claims/extract`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start claim extraction.");
        return;
      }
      router.push(`/deals/${evaluationId}?tab=claims`);
    });
  }

  function build() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/sources/collect`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't start the Source Table run.");
        return;
      }
      setRun({ id: data.runId, status: "queued", progress: 0, error: null, warnings: [], notes: [] });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-[22px]">Evidence Collection</h2>
        <p className="text-muted text-[13px]">
          Uploads {value ? "only" : "+ web search"} → Source Table (S#), each source tiered and checked against the
          Collection Prompts.
        </p>
      </div>

      <MaterialsSection
        evaluationId={evaluationId}
        fundId={fundId}
        documents={documents}
        editable={materialsEditable && !active}
      />

      <section className="card gap-3">
        <label className="flex items-start gap-3 text-[13px]">
          <input
            type="checkbox"
            className="mt-1"
            checked={value}
            disabled={!materialsEditable || pending || active}
            onChange={(e) => toggle(e.target.checked)}
            data-testid="uploads-only"
          />
          <span>
            <span className="font-medium">Uploads only (no web search)</span>
            <span className="text-muted block">
              Build the Source Table from the uploaded materials alone. Can be changed until the Source Table is built.
            </span>
          </span>
        </label>

        {!built && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-divider)] pt-3">
            <button className="btn btn-primary" onClick={build} disabled={!canBuild || pending || active || readable === 0}>
              {active ? "Building…" : "Build Source Table"}
            </button>
            <span className="text-muted text-[13px]">
              {readable} document{readable === 1 ? "" : "s"} with readable text. Each is classified against the
              Collection Prompts and tiered.
            </span>
          </div>
        )}

        {active && run && (
          <div className="flex flex-col gap-1.5" data-testid="run-progress">
            <div className="text-[13px]">
              Step 2 · {run.status === "queued" ? "Waiting for the background worker…" : `Classifying documents · ${run.progress}%`}
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
                The Source Table run failed: {run.error ?? "unknown error"}. Try again.
              </p>
            ) : (
              <p>Source Table built{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
            )}
            {run.warnings.map((w) => (
              <p key={w} className="text-danger text-xs" data-testid="run-warning">
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

        {table.sources.length > 0 && !active && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-divider)] pt-3">
            {claimsStarted ? (
              <Link href={`/deals/${evaluationId}?tab=claims`}>Claim Table →</Link>
            ) : (
              <>
                <button className="btn btn-primary" onClick={extract} disabled={!canBuild || pending}>
                  Extract claims
                </button>
                <span className="text-muted text-[13px]">
                  Next step: atomic claims with verbatim excerpts from every source. Check tiers and parties first; they
                  set each claim&apos;s confidence.
                </span>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-danger text-[13px]">
            {error}
          </p>
        )}
      </section>

      {table.sources.length > 0 && <SourceTable evaluationId={evaluationId} table={table} />}
    </div>
  );
}
