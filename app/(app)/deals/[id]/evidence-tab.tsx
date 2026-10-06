"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LuChevronRight } from "react-icons/lu";
import type { DocumentView } from "@/lib/evaluation-shared";
import { isRunActive, type RunView, type SourceTableView } from "@/lib/source-shared";
import type { ConflictView } from "@/lib/conflict-shared";
import { ConflictRegister } from "./conflict-register";
import { MaterialsSection } from "./materials-section";
import { RerunControl, RunCallsLink } from "./rerun-control";
import { SourceTable, TierSummary } from "./source-table";
import { ContinueLink, NextIcon, StepBar } from "./step-bar";

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
  conflicts,
  hasOutputs,
}: {
  evaluationId: string;
  fundId: string;
  documents: DocumentView[];
  uploadsOnly: boolean;
  canBuild: boolean;
  claimsStarted: boolean;
  materialsEditable: boolean;
  table: SourceTableView;
  conflicts: ConflictView[]; // source conflicts
  hasOutputs: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(uploadsOnly);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(table.run);
  const [pending, startTransition] = useTransition();
  const readable = documents.filter((d) => d.status === "extracted").length;
  // Decision 45: the Source Table waits until the images have been read.
  const readingImages = documents.some((d) => d.visualStatus === "pending" || d.visualStatus === "running");
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
        <h2 className="mb-1 text-page">Evidence Collection</h2>
        <p className="text-muted text-body">
          Sources from your materials{value ? "" : " and the web"}, each tiered by how far it can be trusted and matched
          to your Collection Prompts.
        </p>
      </div>

      <MaterialsSection
        evaluationId={evaluationId}
        fundId={fundId}
        documents={documents}
        editable={materialsEditable && !active}
      />

      <div
        className={`grid items-start gap-6 ${table.sources.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <section className="card gap-3">
          <label className="flex items-start gap-3 text-body">
            <input
              type="checkbox"
              className="mt-0.5"
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


          {run && !active && (
            <div className="flex flex-col gap-1 text-body" data-testid="run-result">
              {run.status === "failed" ? (
                <p role="alert" className="text-danger">
                  The Source Table run failed: {(run.error ?? "unknown error").replace(/\.$/, "")}. Try again.
                </p>
              ) : (
                <p>Source Table built{run.status === "done_with_warnings" ? " with warnings" : ""}.</p>
              )}
              {/* Warnings and run notes are rarely needed: collapsed by default. */}
              {run.warnings.length + run.notes.length > 0 && (
                <details className="group" data-testid="run-details">
                  <summary className="text-muted inline-flex cursor-pointer list-none items-center gap-1 text-meta select-none hover:text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
                    <LuChevronRight aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    {[
                      run.warnings.length && `${run.warnings.length} warning${run.warnings.length === 1 ? "" : "s"}`,
                      run.notes.length && `${run.notes.length} note${run.notes.length === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1 border-l-2 border-[var(--color-neutral-800)] pl-3">
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
                  </div>
                </details>
              )}
              <RunCallsLink evaluationId={evaluationId} run={run} />
            </div>
          )}

          {table.sources.length > 0 && !active && (
            <div className="flex flex-wrap items-start gap-2 border-t border-[var(--color-divider)] pt-3">
              <RerunControl
                evaluationId={evaluationId}
                step={2}
                label="Source Table"
                start={{ path: "sources/collect", tab: "evidence" }}
                hasOutputs={hasOutputs}
              />
              <RerunControl evaluationId={evaluationId} step={2} label="materials" action="Change" hasOutputs={hasOutputs} />
              <span className="text-muted self-center text-meta">
                Documents can only change before the Source Table is built, so changing them re-runs from 2b.
              </span>
            </div>
          )}

          {error && (
            <p role="alert" className="text-danger text-body">
              {error}
            </p>
          )}
        </section>
        {table.sources.length > 0 && <TierSummary sources={table.sources} />}
      </div>

      {table.sources.length > 0 && <SourceTable evaluationId={evaluationId} table={table} />}

      <ConflictRegister evaluationId={evaluationId} conflicts={conflicts} title="Source conflicts" />

      <StepBar
        step={2}
        title="Evidence Collection"
        done={table.sources.length > 0 && !active}
        progress={active && run ? run.progress : undefined}
        status={
          active && run
            ? run.status === "queued"
              ? "Waiting for the background worker…"
              : `Building the Source Table · classifying documents · ${run.progress}%`
            : table.sources.length > 0
              ? `Source Table built · ${table.sources.length} source${table.sources.length === 1 ? "" : "s"}` +
                (claimsStarted ? "" : " · check tiers and parties, then extract claims")
              : run?.status === "failed"
                ? "The last run failed · try again"
                : readingImages
                  ? "Reading the images in the materials…"
                  : readable === 0
                    ? "Upload at least one document with readable text to build the Source Table"
                    : `${readable} document${readable === 1 ? "" : "s"} ready · build the Source Table`
        }
      >
        {!built && !active && (
          <button className="btn btn-primary" onClick={build} disabled={!canBuild || pending || readable === 0 || readingImages}>
            {readingImages ? "Reading images…" : "Build Source Table"}
          </button>
        )}
        {table.sources.length > 0 &&
          !active &&
          (claimsStarted ? (
            <ContinueLink href={`/deals/${evaluationId}?tab=claims`} label="Continue to Claim Extraction" />
          ) : (
            <button className="btn btn-primary" onClick={extract} disabled={!canBuild || pending}>
              Extract claims
              <NextIcon />
            </button>
          ))}
      </StepBar>
    </div>
  );
}
