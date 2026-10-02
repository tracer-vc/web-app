"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RunView } from "@/lib/source-shared";

// What a re-run from each step clears (decision 20).
const CLEARS: Record<number, string> = {
  2: "the Source Table and everything after it: claims, conflicts, uncertainties, counter-case, dimension scores and outputs",
  3: "the Claim Table (claims, claim conflicts, uncertainties, analyst link marks) and everything after it",
  4: "the counter-case, the uncertainties it added, the falsifiers, dimension scores and outputs",
  5: "the dimension scores, including analyst overrides, and the outputs",
  6: "the outputs (Thesis Card, Decision Snapshot)",
};

// "Re-run step": confirm inline, reset from the step, then start it again via
// the step's own route (unless `start` is omitted, e.g. to change materials).
export function RerunControl({
  evaluationId,
  step,
  label,
  start,
  hasOutputs,
  action = "Re-run",
}: {
  evaluationId: string;
  step: number;
  label: string;
  start?: { path: string; tab: string };
  hasOutputs: boolean;
  action?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/evaluations/${evaluationId}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, confirmFullReset: full }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't reset the step.");
        return;
      }
      if (start) {
        const run = await fetch(`/api/evaluations/${evaluationId}/${start.path}`, { method: "POST" });
        if (!run.ok) {
          const d = await run.json().catch(() => null);
          setError(`Reset done, but the run didn't start: ${d?.error ?? "unknown error"}`);
          router.refresh();
          return;
        }
        setOpen(false);
        router.push(`/deals/${evaluationId}?tab=${start.tab}`);
      } else {
        setOpen(false);
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button className="btn text-xs print:hidden" onClick={() => setOpen(true)} data-testid={`rerun-${step}`}>
        {action} {label}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--color-danger)]/50 p-3 text-[13px] print:hidden" data-testid="rerun-confirm">
      <p>
        {action} {label}: this clears {CLEARS[step]}. IDs are renumbered on the next run. The reset is logged.
      </p>
      {hasOutputs && (
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={full} onChange={(e) => setFull(e.target.checked)} data-testid="confirm-full-reset" />
          <span>Outputs exist and their IDs are frozen. I confirm a full reset.</span>
        </label>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary text-xs" onClick={confirm} disabled={pending || (hasOutputs && !full)}>
          {pending ? "Working…" : start ? `Clear and ${action.toLowerCase()}` : "Clear and continue"}
        </button>
        <button className="btn text-xs" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

// Link from a finished run to its model calls (failures, validation errors).
export function RunCallsLink({ evaluationId, run }: { evaluationId: string; run: RunView }) {
  return (
    <Link href={`/deals/${evaluationId}/runs/${run.id}`} className="text-xs" data-testid="run-calls-link">
      {run.status === "failed" ? "See the failing model calls →" : "Model calls for this run →"}
    </Link>
  );
}
